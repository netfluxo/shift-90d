CREATE TABLE `user_points` (
	`user_id` text PRIMARY KEY NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`active_days` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_user_points_points` ON `user_points` (`points`);--> statement-breakpoint
-- Backfill a partir da fonte de verdade. Inclui usuário sem nenhum evento (row zerada),
-- para que as leituras possam usar LEFT JOIN sem tratar ausência como caso especial.
INSERT INTO `user_points` (`user_id`, `points`, `active_days`)
SELECT u.`id`,
       COALESCE(SUM(pe.`points_delta`), 0),
       COALESCE(COUNT(DISTINCT CASE WHEN pe.`source` = 'post' THEN pe.`event_date` END), 0)
FROM `users` u
LEFT JOIN `point_events` pe ON pe.`user_id` = u.`id`
GROUP BY u.`id`
ON CONFLICT(`user_id`) DO UPDATE SET `points` = excluded.`points`, `active_days` = excluded.`active_days`;
--> statement-breakpoint
-- Triggers de manutenção. Recomputam (não incrementam) porque
-- active_days = COUNT(DISTINCT event_date) não é decrementável sem consultar os
-- outros eventos da mesma data. Custo por write: ~7 rows via idx_pe_user.
--
-- Ficam no banco, não no código de app, porque point_events é escrito por 4 caminhos
-- (createPost, deletePost, /api/sabados POST e DELETE) mais seed e SQL manual via
-- `wrangler d1 execute`. Trigger não pode ser furado por nenhum deles.
--
-- BEGIN/END em MAIÚSCULAS: com `begin` minúsculo o D1 remoto falha com
-- `incomplete input [code: 7500]` enquanto passa em --local.
-- Ver https://github.com/cloudflare/workers-sdk/issues/10998
CREATE TRIGGER `point_events_after_insert` AFTER INSERT ON `point_events` BEGIN
  INSERT INTO `user_points` (`user_id`, `points`, `active_days`) VALUES (
    NEW.`user_id`,
    (SELECT COALESCE(SUM(`points_delta`), 0) FROM `point_events` WHERE `user_id` = NEW.`user_id`),
    (SELECT COUNT(DISTINCT `event_date`) FROM `point_events` WHERE `user_id` = NEW.`user_id` AND `source` = 'post')
  ) ON CONFLICT(`user_id`) DO UPDATE SET `points` = excluded.`points`, `active_days` = excluded.`active_days`;
END;
--> statement-breakpoint
CREATE TRIGGER `point_events_after_delete` AFTER DELETE ON `point_events` BEGIN
  INSERT INTO `user_points` (`user_id`, `points`, `active_days`) VALUES (
    OLD.`user_id`,
    (SELECT COALESCE(SUM(`points_delta`), 0) FROM `point_events` WHERE `user_id` = OLD.`user_id`),
    (SELECT COUNT(DISTINCT `event_date`) FROM `point_events` WHERE `user_id` = OLD.`user_id` AND `source` = 'post')
  ) ON CONFLICT(`user_id`) DO UPDATE SET `points` = excluded.`points`, `active_days` = excluded.`active_days`;
END;
--> statement-breakpoint
-- Recalcula os dois lados: um UPDATE pode mover o evento entre usuários.
CREATE TRIGGER `point_events_after_update` AFTER UPDATE ON `point_events` BEGIN
  INSERT INTO `user_points` (`user_id`, `points`, `active_days`) VALUES (
    OLD.`user_id`,
    (SELECT COALESCE(SUM(`points_delta`), 0) FROM `point_events` WHERE `user_id` = OLD.`user_id`),
    (SELECT COUNT(DISTINCT `event_date`) FROM `point_events` WHERE `user_id` = OLD.`user_id` AND `source` = 'post')
  ) ON CONFLICT(`user_id`) DO UPDATE SET `points` = excluded.`points`, `active_days` = excluded.`active_days`;
  INSERT INTO `user_points` (`user_id`, `points`, `active_days`) VALUES (
    NEW.`user_id`,
    (SELECT COALESCE(SUM(`points_delta`), 0) FROM `point_events` WHERE `user_id` = NEW.`user_id`),
    (SELECT COUNT(DISTINCT `event_date`) FROM `point_events` WHERE `user_id` = NEW.`user_id` AND `source` = 'post')
  ) ON CONFLICT(`user_id`) DO UPDATE SET `points` = excluded.`points`, `active_days` = excluded.`active_days`;
END;
--> statement-breakpoint
-- Usuário criado pelo Better Auth (signup) precisa da row, senão o LEFT JOIN
-- teria que tratar ausência e /ranking omitiria gente com 0 ponto de forma inconsistente.
CREATE TRIGGER `users_after_insert` AFTER INSERT ON `users` BEGIN
  INSERT INTO `user_points` (`user_id`, `points`, `active_days`) VALUES (NEW.`id`, 0, 0)
  ON CONFLICT(`user_id`) DO NOTHING;
END;

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem incremental cache: o app é 100% dinâmico (todas as páginas force-dynamic),
// então o cache de ISR/SSG não agrega. Além disso, o override r2IncrementalCache
// dispara a etapa "Populating remote R2 incremental cache" no deploy, que exige
// escopo de dados R2 no token (falha 401 no CI só com Workers:Edit). O default
// (no-op) evita isso; qualquer cache é resolvido em runtime.
export default defineCloudflareConfig();

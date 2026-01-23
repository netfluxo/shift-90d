import Image from 'next/image';

interface HeaderProps {
  subtitle?: string;
}

export default function Header({ subtitle }: HeaderProps) {
  return (
    <header className="sticky top-0 bg-white border-b border-gray-100 z-40">
      <div className="px-4 py-3 flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="Shift"
          width={100}
          height={33}
          priority
        />
        {subtitle && (
          <span className="text-sm text-gray-500">{subtitle}</span>
        )}
      </div>
    </header>
  );
}

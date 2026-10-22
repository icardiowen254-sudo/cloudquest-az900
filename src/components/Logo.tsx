import { Cloud } from 'lucide-react';

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-forest">
        <Cloud className="h-5 w-5" aria-hidden />
      </span>
      <span className={`text-lg font-bold tracking-tight ${onDark ? 'text-white' : 'text-forest'}`}>
        CloudQuest <span className="font-medium opacity-75">AZ-900</span>
      </span>
    </div>
  );
}

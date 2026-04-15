const VARIANTS: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
  yellow: "bg-yellow-100 text-yellow-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-gray-100 text-gray-800",
  purple: "bg-purple-100 text-purple-800",
};

interface StatusBadgeProps {
  label: string;
  variant?: keyof typeof VARIANTS;
}

export function StatusBadge({ label, variant = "gray" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${VARIANTS[variant]}`}
    >
      {label}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <StatusBadge label={active ? "Activa" : "Inactiva"} variant={active ? "green" : "red"} />;
}

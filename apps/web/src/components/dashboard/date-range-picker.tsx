"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";

export interface DateRange {
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;
  label: string;
}

const TODAY = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const PRESETS: Array<{ label: string; getDates: () => { startDate: string; endDate: string } }> = [
  {
    label: "Hoy",
    getDates: () => ({ startDate: TODAY(), endDate: TODAY() }),
  },
  {
    label: "7 dias",
    getDates: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86400000);
      return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
    },
  },
  {
    label: "30 dias",
    getDates: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86400000);
      return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
    },
  },
  {
    label: "Este mes",
    getDates: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString().split("T")[0], endDate: now.toISOString().split("T")[0] };
    },
  },
  {
    label: "Mes pasado",
    getDates: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
    },
  },
  {
    label: "Este año",
    getDates: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString().split("T")[0], endDate: now.toISOString().split("T")[0] };
    },
  },
];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(value.startDate);
  const [customEnd, setCustomEnd] = useState(value.endDate);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePreset = (preset: (typeof PRESETS)[0]) => {
    const dates = preset.getDates();
    onChange({ ...dates, label: preset.label });
    setCustomStart(dates.startDate);
    setCustomEnd(dates.endDate);
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      onChange({ startDate: customStart, endDate: customEnd, label: "Personalizado" });
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
      >
        <Calendar className="h-4 w-4 text-gray-400" />
        <span className="hidden sm:inline">{value.label}</span>
        <span className="sm:hidden text-xs">
          {value.startDate === value.endDate
            ? new Date(value.startDate + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })
            : `${new Date(value.startDate + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })} - ${new Date(value.endDate + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Periodo
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  value.label === preset.label
                    ? "bg-black text-white"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Personalizado
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              />
              <span className="text-xs text-gray-400">a</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
            <button
              onClick={handleCustomApply}
              disabled={!customStart || !customEnd || customStart > customEnd}
              className="mt-2 w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to format currency robustly against NaN, null, undefined
export const formatUSD = (val: any) => {
  const num = Number(val);
  const validNum = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(validNum);
};

export const formatBs = (val: any) => {
  const num = Number(val);
  const validNum = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(validNum).replace('VES', 'Bs.');
};

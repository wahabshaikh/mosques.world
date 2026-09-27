export function track(goal: string, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const datafast = (window as Window & { datafast?: (goal: string, props?: object) => void }).datafast;
  datafast?.(goal, props);
}

import { describe, expect, it } from "vitest";
import { askForTimesMessage, reminderFor, REMINDERS, shareTimesMessage, whatsappHref } from "./reminders";

describe("reminderFor", () => {
  it("is stable for a seed and fits the context", () => {
    const first = reminderFor("share", "east-london-mosque");
    expect(reminderFor("share", "east-london-mosque")).toBe(first);
    expect(first.contexts).toContain("share");
  });

  it("covers every context and cites every reminder", () => {
    for (const context of ["add", "confirm", "share", "masjid"] as const) {
      expect(reminderFor(context).contexts).toContain(context);
    }
    for (const item of REMINDERS) expect(item.source).toMatch(/Qur'an \d+:\d+|Sahih/);
  });
});

describe("share messages", () => {
  it("builds WhatsApp links with the message encoded", () => {
    const message = askForTimesMessage("Masjid Al-Noor", "https://mosques.world/m/al-noor");
    expect(message).toContain("Masjid Al-Noor");
    expect(whatsappHref(message)).toBe(`https://wa.me/?text=${encodeURIComponent(message)}`);
    expect(shareTimesMessage("X", "https://u")).toContain("https://u");
  });
});

/**
 * Short ayahs and hadiths shown beside contribution prompts, each with its source so readers can check
 * it. Wording follows common English translations; keep citations exact when adding to this list.
 */

export type ReminderContext = "add" | "confirm" | "share" | "masjid";

export type Reminder = { text: string; source: string; contexts: ReminderContext[] };

export const REMINDERS: Reminder[] = [
  {
    text: "Whoever guides someone to goodness will have a reward like the one who does it.",
    source: "Sahih Muslim 1893",
    contexts: ["share", "add"],
  },
  {
    text: "Cooperate in righteousness and piety.",
    source: "Qur'an 5:2",
    contexts: ["add", "confirm", "share"],
  },
  {
    text: "Allah helps His servant as long as the servant helps his brother.",
    source: "Sahih Muslim 2699",
    contexts: ["add", "confirm"],
  },
  {
    text: "Prayer in congregation is twenty-seven degrees better than prayer alone.",
    source: "Sahih al-Bukhari 645",
    contexts: ["masjid", "share"],
  },
  {
    text: "The masajid of Allah are maintained only by those who believe in Allah and the Last Day.",
    source: "Qur'an 9:18",
    contexts: ["masjid", "add"],
  },
  {
    text: "Do not belittle any good deed.",
    source: "Sahih Muslim 2626",
    contexts: ["confirm", "add"],
  },
  {
    text: "Whoever does an atom's weight of good will see it.",
    source: "Qur'an 99:7",
    contexts: ["confirm", "add", "share"],
  },
];

/** A stable pick for the context (same seed, same reminder) so server and client render the same line. */
export function reminderFor(context: ReminderContext, seed = ""): Reminder {
  const pool = REMINDERS.filter((item) => item.contexts.includes(context));
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length] ?? REMINDERS[0]!;
}

/** The WhatsApp share link for a message (wa.me works on phones and desktop). */
export function whatsappHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** The message people forward to ask friends to fill in a mosque's times. */
export function askForTimesMessage(name: string, url: string): string {
  return `Do you pray at ${name}? Its jamā'ah times aren't on mosques.world yet. Add them in a minute so the next person knows when to pray: ${url}`;
}

/** The message people forward after confirming or adding a mosque's times. */
export function shareTimesMessage(name: string, url: string): string {
  return `Today's jamā'ah times at ${name}, kept up to date by the community: ${url}`;
}

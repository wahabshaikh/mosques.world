# 1. Product

## 1.1 Problem

Adhan times can be calculated from coordinates, but **iqamah** (when the congregation actually
prays) is set by each mosque and changes through the year: with daylight saving, the seasons,
Ramadan, or a committee decision. Today that information lives on a paper board by the
entrance, a WhatsApp group, a PDF on a website nobody updates, or Google Maps listings with no
prayer data at all. Travellers, new residents, women looking for a women's section and anyone
needing step-free access have no dependable way to know **where** to pray and **when** the
jamā'ah starts.

## 1.2 Solution

A community-maintained directory, in the spirit of Wikipedia and OpenStreetMap, with a
consumer-grade experience inspired by Airbnb:

1. **Find**: search or browse a map of mosques and prayer spaces, filtered by what you need.
2. **Know**: every mosque page shows today's adhan and iqamah times, Jumu'ah jamā'ahs and
   amenities, each with a visible trust signal ("Verified 2 days ago · 9 people").
3. **Contribute**: anyone signed in can add or correct a time or amenity. Changes go live
   through lightweight community consensus, not a single editor.
4. **Remember**: "I prayed here" builds a personal, shareable map of every mosque you have
   prayed in (`mosques.world/@username`). That is the growth loop and the reward for contributing.

## 1.3 Users

| Persona | Needs | Primary surfaces |
|---|---|---|
| **Traveller** | Nearest mosque, next jamā'ah, women's section, how to get there | Explore, mosque page (mobile) |
| **Local regular** | Current iqamah times for 2–3 mosques; alerts when they change | Saved mosques, notifications |
| **Contributor / verifier** | Fast way to confirm or correct times; recognition | Quick verify, update modal, profile, badges |
| **Steward** (mosque volunteer/committee) | Keep their mosque accurate with authority; publish timetables | Steward tools (Phase 6), timetables (Phase 7) |
| **Moderator** (internal/trusted) | Resolve disputes, spam, duplicates | Admin queue |

## 1.4 Principles

1. **Trust is the product.** Every time and amenity shows its provenance: who confirmed it, how
   many people and how recently. We never show a guess as fact. Calculated adhan times are
   labelled as calculated.
2. **One-tap contribution.** Confirming is always easier than editing. The best contribution is
   "yes, still 4:30" from someone standing in front of the board.
3. **Mobile first, at the mosque.** Most contributions happen on a phone, at the mosque, in
   under 30 seconds.
4. **Inclusive by default.** Women's sections, wudhu facilities and accessibility are
   first-class filters, not footnotes.
5. **Neutral and respectful.** No ratings or reviews of mosques and no sectarian labels in the
   MVP. We describe facilities and times, not communities.
6. **Privacy-respecting.** Check-ins are private by default for location history beyond the
   mosque name; precise location is never stored after a geo-check; photo EXIF is stripped.
7. **Open data.** The directory is built on OpenStreetMap and will be given back as open data
   (ODbL).

## 1.5 Glossary

| Term | Meaning |
|---|---|
| Adhan | Call to prayer; start of a prayer window. Calculated astronomically per location. |
| Iqamah | Time the congregational prayer starts at a specific mosque. Community-sourced. |
| Jamā'ah | A congregation. A mosque can hold several Jumu'ah jamā'ahs (1st, 2nd, …). |
| Jumu'ah | Friday congregational prayer, preceded by a khutbah (sermon). |
| Wudhu | Ritual ablution; mosques have wudhu areas (sometimes separate for women). |
| Place | Any row in the directory: mosque, musalla/prayer room, eidgah. |
| Fact | A single community-maintained attribute of a place (e.g. `iqamah.asr`, `amenity.women_section`). |
| Vote | A user's confirmation or dispute of a candidate value for a fact. |
| Steward | A verified volunteer with elevated weight for a specific place (Phase 6). |
| Trust level | A user's standing (0–3), which sets vote weight and rate limits. |

## 1.6 Success metrics

| Metric | Definition | MVP target (6 months) |
|---|---|---|
| Verified coverage | % of viewed mosque pages whose 5 daily iqamahs are all *Verified* | 25% in launch cities |
| Freshness | Median age of last confirmation on viewed pages | < 21 days |
| Contribution rate | Weekly users who vote or edit / weekly signed-in users | ≥ 20% |
| Accuracy | % of accepted values later disputed within 14 days | < 5% |
| Profile shares | Profile share clicks / profiles with ≥ 3 check-ins | ≥ 15% |

## 1.7 Out of scope (all phases unless stated)

- Reviews, star ratings or rankings of mosques.
- Donations and payments.
- Event listings beyond prayer times, Eid and Taraweeh (Phase 7).
- Native iOS/Android apps (the PWA covers the MVP).
- Classifying mosques by school of thought or sect.

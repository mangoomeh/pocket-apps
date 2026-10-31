# Pocket Apps

A set of small, mobile-friendly everyday apps: money, travel, tools and a few for fun. They need no installation or build step and run in any browser.
Live at https://mangoomeh.github.io/pocket-apps/

- **Works offline:** after the first visit, every app opens without a connection (handy abroad or in a basement
  restaurant). A service worker (`sw.js`) keeps a copy of every page and file; online, pages still come fresh from the
  network.
- **Add to Home Screen:** each app has its own icon and opens straight into that app, full screen.
- **Your data stays on your phone,** and the browser is asked to keep it. **Backup** on the home screen saves
  everything (including receipt photos and the floor plan) to one file you can keep in Files, iCloud Drive or
  Google Drive, and restores it on a new phone.

## Apps

### 💵 Petty Cash (`petty-cash/`)

A cash denomination counter with a transaction checker.

- **Opening balance setup:** enter how many of each note and coin you have (SGD, $100 down to 5¢).
- **Transaction checker:** enter the purchase amount, tap + for each note or coin you take out, and add any change you
  received. *Confirm* only deducts from your cash on hand when the cash you selected equals the purchase amount.
- **History with undo, and low cash warnings.** "Export to spreadsheet" saves the history as a CSV file, e.g. for a
  reimbursement claim.
- **Stats:** pick the last 7 or 30 days, this month or all time. A headline total compared with the period before
  (this month is compared with the same days last month), tiles for the number of purchases, the average purchase,
  cash on hand, how many days it lasts at the last 30 days' rate and any top-ups, then spending per day (per month for
  all time) with a tap-for-value tooltip and a table view, what it went on (grouped by note), which notes and coins
  were handed over, and the biggest purchases. Undone purchases don't count. Worked out in `src/cash.js`
  (`periodRange`, `spendStats`).
- **Two themes:** modern, or retro Windows 95 (title bar, bevelled buttons, LCD balance, taskbar). The 🖥️ button in
  the header switches between them, and the choice is remembered on that device.

### 🍣 Sushiro Tracker (`sushiro/`)

Counts plates during a meal and works out the bill.

- **Plate counter:** one + and − per plate colour. The defaults are Red $2.30, Silver $2.90, Gold $3.90 and Black $4.90,
  and you can edit them under Settings to match your outlet.
- **Specials:** add any dish at a custom price (ramen, drinks, desserts).
- **Live bill:** the subtotal plus 10% service charge, then 9% GST on the subtotal and service charge, as Singapore
  requires. You can change either rate or set it to 0.
- **Saved visits:** save each meal with the outlet, the items and the bill, and see this month's visits, plates and spending.
  A saved visit keeps the prices it was charged at.
- **Receipt check:** snap the receipt, or paste its text from iPhone Live Text or Google Lens. The app reads the total
  and compares it with what you tracked, for example "The receipt is $2.76 more. Maybe 1 Red plate wasn't counted?".
  Text recognition runs on the phone with [Tesseract.js](https://tesseract.projectnaptha.com/), which downloads
  about 10 MB on first use. Nothing is uploaded. If the total is misread you can correct it by hand.
- **Plate counts from the receipt:** Sushiro receipts list items by price (`$2.3 Sushi 20 $46.00`), so the scan also
  reads each item. Sushi lines are matched to plate colours and shown next to your counts ("Red: receipt 20 · you
  19"), and other items (chawanmushi, soup, dishes) are listed. One button fills the meal in from the receipt. The
  reader is built to cope with common misreads on thermal paper, and it says when some lines couldn't be read,
  because the items then don't add up to the subtotal. Pasting text from Live Text or Google Lens gives the best
  results.
- **Receipt photos:** a compressed copy of each photo is kept with its saved visit in the browser's IndexedDB on that
  device.

### 💸 Split (`split/`)

Shares costs in a group of friends (a trip, a flat, a dinner) and works out who pays whom.

- **Groups:** name a group and list the people. The list shows each group with what you're owed or owe in it;
  tap Edit to delete groups (or use "Delete group" under People).
- **Expenses:** what it was for, the amount, who paid, and how to split it: **equally** among the people you tick,
  by **exact amounts**, or by **shares** (e.g. 2 shares for someone who had two nights). Each person's part is shown as
  you type. Separate ticks for service charge and GST work out the nett total from the menu prices (GST is
  charged on the service charge too). The rates start at 10% and 9% and can be changed, e.g. to 6% SST abroad; each
  group remembers the last ones used. Tap an expense to edit or delete it. Shares are kept exact (a $125.35
  bill four ways is $31.3375 each) and each person's total is rounded to the cent only once, at the end, in a way
  that still adds up to what was spent.
- **Summary:** the first thing a group opens on. It asks "Who are you?" once (one tap on your name), then shows what you
  owe or are owed and to whom, with PayNow and "I've paid" buttons, and a folded "How it adds up" list of your share
  of each expense.
- **Sharing:** all in "Tell the group" on the Summary tab. "Summary only" sends who pays whom as text; "Summary +
  link" adds a read-only snapshot link. Friends who tap it pick their name and see what they owe, the balances and
  the expenses, with nothing to edit and nothing saved to their groups. The link carries only names, descriptions,
  amounts in the home currency and who shares each expense, plus PayNow numbers of people who are owed money. There's
  no server: anyone with the link can read what's in it. For someone who adds expenses too, "Share an editable copy"
  sends the whole group, and opening it merges it into the copy on that phone.
- **Balances and settle up:** who is owed and who owes, and the fewest payments that square everyone up (at most one
  fewer than the number of people). "Mark as paid" records a payment; payments can also be added by hand.
- **PayNow QR:** add a PayNow mobile number or UEN to a person, and each payment to them gets a PayNow QR for the exact
  amount that any Singapore banking app can scan. The SGQR text and its checksum are built in `src/split.js`; the QR
  image is drawn by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), loaded from the CDN when
  first needed.
- **Sharing without accounts:** "Share link" puts the whole group, compressed, in the link's `#` part, so it never
  reaches a server. Each phone keeps its own copy; opening a link adds the group or merges it into the copy already
  there. Every expense and person has an id and an edit time, so additions, edits and deletions from different phones
  all survive, and merging in any order gives the same result. "Copy summary" makes a who-pays-whom message with the
  link for the group chat.
- **Who are you?** is kept only on your phone and is used for "You owe $12.40" and "you lent" notes.
- **Other currencies:** pick the currency next to the amount (THB, JPY, MYR…). Today's rate is filled in from
  [open.er-api.com](https://www.exchangerate-api.com) (free, no key) and can be changed to match your card or money
  changer. The rate is saved with the expense, so balances don't move later. Balances, settling up and PayNow are in
  the group's home currency (SGD unless you pick another before adding expenses).
- **From other apps:** Sushiro's "Split this bill" and Trip Planner's "Expenses in Split" open Split with the bill
  or the trip's group ready (`#add=` and `#trip=` links).

### 🧳 Trip Planner (`trip/`)

A day-by-day itinerary and a packing list for each trip.

- **Plan:** one card per day of the trip. Add activities, food, transport and stays with an optional time, a place
  (which links to Google Maps, with the destination added) and notes such as booking references. Timed items are
  listed in time order. Today is highlighted during the trip, and the header counts down ("12 days to go") and then
  counts days ("Day 3 of 7"). If the dates change, items left outside them are kept under "Not on a day".
- **Packing:** a list worked out from the trip. Clothes scale with the number of nights (capped at 4 days' worth if
  you can do laundry); going overseas adds passport, adaptor and eSIM; carry-on only marks liquids "under 100 ml"; and
  activities (beach, hiking, work, snow, nice dinners) add their own items. Tick things off, hide what's packed,
  remove suggestions you don't need, add your own, and "Untick all" to pack for the trip home.
- **Weather:** "Check the weather" looks up the destination on [Open-Meteo](https://open-meteo.com) (free, no key)
  and uses the forecast when the trip is within about two weeks, otherwise the same dates last year. Cold, rain or
  heat add a coat, an umbrella or sunscreen to the list. You can also set the weather yourself.
- **Sharing:** the same no-server links as Split (`src/sync.js`). The link carries the plan and trip details and
  merges into a friend's copy; packing ticks stay on each phone, since everyone packs their own bag. "Copy itinerary"
  gives a text version for the group chat.
- **Add to calendar:** saves the plan as an `.ics` file that Google or Apple Calendar can import: the trip as an
  all-day event, timed items as one-hour events and untimed ones as all-day events.
- **Expenses in Split:** opens this trip's group in Split, or starts one named after the trip.

### 🧮 GX-84 Calculator (`calc84/`)

A handheld graphing calculator modelled on the TI-84 Plus CE. It's a recreation, not an emulator: no Texas
Instruments software is used.

- **Keypad:** the full 84-style keypad with 2nd (blue) and ALPHA (green) functions, A-LOCK, an arrow pad that
  repeats while held, and keyboard support on computers (digits, operators, Enter, Backspace, Esc, arrows).
- **Home screen:** TI order of operations (`2^3^2 = 64`, `⁻2² = ⁻4`, implicit ×), automatic closing brackets, `Ans`
  (pressing + first gives `Ans+`), STO→ to variables A–Z and θ, ENTRY recall, ENTER to repeat, and TI-style
  errors with Quit/Goto.
- **Stacked fractions:** ALPHA + X,T,θ,n inserts an n/d fraction box, as on the TI-84 Plus CE. ▼ and ▲ move
  between the numerator and denominator. A calculation typed with fractions answers as a stacked fraction, and
  ALPHA + Y= (F1) opens the FRAC menu (n/d, ▶F◀▶D, ▶Frac, ▶Dec). Fractions also work in Y=.
- **Menus:** MATH (▶Frac, ▶Dec, ³, ³√(, ˣ√, nDeriv(, fnInt(), NUM (abs, round, iPart, fPart, int, min, max, lcm,
  gcd), PRB (rand, nPr, nCr, !, randInt), and VARS → Y-VARS.
- **Graphing:** Y= with ten colour-coded functions, WINDOW, ZOOM (ZBox, Zoom In/Out, ZDecimal, ZSquare, ZStandard,
  ZTrig, ZInteger, ZoomFit), TRACE (typing a number jumps to that X), GRAPH with a free cursor, and FORMAT (grid,
  axes, coordinates).
- **CALC:** value, zero, minimum, maximum, intersect, dy/dx and ∫f(x)dx, with Left/Right Bound and Guess prompts and
  shading for integrals.
- **TABLE and TBLSET, plus MODE** (Normal/Sci, Float/Fix 0–9, Radian/Degree). Everything is saved on the device.
- **Not yet:** STAT, lists, MATRIX, programs, APPS and complex numbers. Their keys show a short "not in this version"
  note.

### 🔎 Wallet Radar (`wallets/`)

Shows who went into a token, and when, on **Robinhood Chain** and **Solana**. It needs no keys by default and only
reads public blockchain data: there's no wallet connection and nothing to sign.

- **Search by name:** type a token's name or symbol (via DexScreener's free search) and pick it from a list of
  tokens on the chosen chain, most traded first. Copycats and tokens with "big liquidity, almost no trading" (a
  sign of a fake) are flagged. You can also paste the address directly.

- **Buyers:** how many wallets bought at least X% of a token's supply, or spent at least $X, between two times
  (for example, the first hour after launch). The count leads the results, with a breakdown (≥$1K, ≥$10K, …).
  - **$ spent** is read from each buy transaction: ETH, wrapped ETH or SOL valued at that minute's price (Coinbase
    candles, `src/prices.js`), plus USDC, USDT or USDG. Buyers who paid from another address (smart accounts,
    bundles bought by someone else) can't be priced and are left out, with a count shown.
  - Each wallet shows the first buy time, number of buys, amount sold in the window, net position, current holding, and flags:
  - **bundle:** one transaction bought for several wallets;
  - **likely a trading bot:** many buys;
  - **contract:** usually a smart wallet.

  You can save the list as a group or export it to CSV.
- **Compare:** which wallets of a saved group (or pasted addresses) bought or received another token in a time window.
- **Wallet:** which wallets an address sent tokens to (or received them from), with counts and amounts. Tap any
  wallet to follow the trail. ETH transfers need a free Blockscout key.
- **Scam flags:** token names with hidden characters (fake look-alike tokens) and look-alike addresses (address
  poisoning) are flagged.
- **Robinhood Chain data:** the chain's free public RPC. `src/onchain.js` splits requests to fit the node's limits,
  backs off when rate-limited, and fills in block times the node leaves out.
- **Solana data:** PublicNode's free node (`src/solana.js`). Solana's own public node blocks web pages, so it isn't
  used.
  - A **buy** is a wallet that signed a transaction and ended up with more of the token.
  - **Same block** flags wallets that bought in the same block, typical of launch snipers.
  - SOL transfers are included in the Wallet view.
  - Token accounts and wallet-vs-program checks are worked out on the device, so the node's restricted "indexed"
    calls aren't needed.
  - An optional Helius key can be set as a backup.

### ☯️ BaZi Calculator (`bazi/`)

Works out a Four Pillars of Destiny (八字) chart from a birth date and time.

- **For beginners:** a one-minute “New to BaZi? Start here” guide (the eight characters, the five elements and how
  they feed each other, the day master, balance and luck), open until you close it. The header says who you are in
  plain words (“💧 Yang Water: the ocean”), the ten gods use everyday names in English (Peer, Rival, Enjoyment,
  Expression, Windfall, Income, Pressure, Authority, Intuition, Support; the traditional name shows when tapped),
  elements carry emojis, every clash and combination says what it means, and the technical details are folded away.

- **Four Pillars:** the year, month, day and hour stems and branches, coloured by element, with each one's ten god
  (relative to the day master), hidden stems, 纳音 and life stage, in labelled rows. Tap any label or value for a
  plain-English explanation. If the birth time is unknown, the hour pillar is
  left out.
- **Solar terms:** the year changes at 立春 and each month at its solar term. The terms are worked out from the sun's
  position (abridged VSOP87, in `src/bazi.js`), so the app needs no tables or network and agrees with published
  times to within a minute. The chart shows which term the birth month began with.
- **Lunar (农历) birthdays:** switch the date to Lunar and pick the lunar year, month (including leap months) and
  day. The conversion (`src/lunar.js`) uses new moons and solar terms in Beijing time, as the official calendar does,
  for 1901–2099. The lunar date is also shown for any Western date.
- **Birthplace and historical time zones:** pick a city and the app uses the UTC offset that applied there on the
  birth date, from the browser's time zone history. For example, Singapore and Malaysia were UTC+7:30 until 1982,
  and China used daylight saving from 1986 to 1991. "Other" lets you pick any time zone region (which also handles daylight saving) or a fixed offset, and a longitude.
- **True solar time (optional):** the day and hour pillars use local solar time (the birthplace's longitude plus the
  equation of time). You can also choose whether 23:00 starts the next day.
- **Five elements, day master, and interactions:** element counts (with and without hidden stems), stem
  combinations and clashes, branch combinations, clashes, harms, punishments, three-harmony and directional groups,
  and the void branches.
- **Luck pillars (大运):** ten 10-year pillars, forward or backward by gender and year polarity. The start age is
  worked out from the days to the nearest solar term (3 days = 1 year). Tap a pillar to see its ten years (流年);
  the current ones are highlighted.
- **Tabs:** Chart, Summary (with the full reading below it), Luck, and More (saved charts, Match, About).
- **Summary:** one screen for people who don't want the detail: the pillars, you in a line, strengths, what to
  watch for, what helps, and whether this decade and year look favourable.
- **Reading (plain English):** what the day master says about your strengths and watch-outs, what each pillar covers
  in life, which ten-god themes are strong or missing, element balance, and what the current luck pillar and year
  bring, plus a short guide to reading a chart. The text is in `src/baziread.js` and is framed as traditional
  interpretation, not prediction.
- **Strength and favourable elements:** scores whether the day master is strong or weak (all stems and hidden
  stems, with the month counted double), shows the three classic checks (得令, 得地, 得势), and picks the useful
  element (用神) and the favourable ones. A winter or summer birth also counts Fire or Water as favourable for
  climate (调候). Luck pillars, years, months and days are marked favourable, mixed or demanding.
- **Now (Luck tab):** this year's, month's and day's pillars with their ten gods and any clashes or combinations
  with your chart, the twelve month pillars of the year (流月), and a calendar of this month's day pillars (流日).
  Pick any date (or step a month at a time, or tap a day in the calendar) to see that year, month and day instead.
- **Symbolic stars (神煞):** Nobleman, Academic Star, Peach Blossom, Travelling Horse, Canopy, Prosperity Star and
  Goat Blade, with where they fall.
- **No birth time:** all twelve possible hour pillars are shown; tap one to try it.
- **Share:** a link that opens the same chart (no account needed), or the chart copied as text.
- **Language:** a 中文 / EN switch in the header changes the whole app, including readings and explanations.
  English mode keeps the BaZi characters and shows the Chinese term beside its English name where it helps. The
  first visit follows the phone's language.
- **Match:** compares two charts (the current one and any saved one) on day masters, spouse star, spouse
  palaces (day branches), zodiac signs and whether each brings the other's favourable elements (`src/bazimatch.js`).
- **Zi Wei Dou Shu:** the Summary links to the Zi Wei Dou Shu app with the same birth details.
- **Saved charts** are kept on the device.

### 🔮 Zi Wei Dou Shu (`ziwei/`)

Purple Star Astrology (紫微斗数): the 12 palaces of life and the stars in them, from the lunar date and two-hour period
of birth. A separate system from BaZi; people often use both.

- **For beginners:** an “At a glance” card in plain words (your main star, the 10-year chapter you're in, this year,
  and where good fortune and the area to watch fall), a one-minute guide to reading the 12 boxes, English nicknames
  under the main stars (Emperor, Wolf…), and the method folded away.
- **Birth details** as in the BaZi app: a Western or lunar (农历) date, the time, gender and birthplace. The time is
  converted with the birthplace's time zone as it was on that date, with optional true solar time and the 23:00 rule,
  using the same code as BaZi (`src/bazi.js`), so both apps describe the same moment. A birth time is required.
- **Chart:** the traditional 4×4 grid with each palace's stem and branch, the 14 main stars, 16 common minor stars,
  the birth-year four transformations (化禄 化权 化科 化忌), the body palace and each palace's 10-year period (大限); the
  current period and this year's palace (流年) are highlighted. Tap a palace for what it covers and what its stars mean
  (an empty palace borrows the opposite one's main stars).
- **Reading:** the life palace in a line, then all 12 palaces explained in order.
- **Luck:** where you are now (the current 10-year period, and where this year's four transformations land), every
  10-year period with its palace and stars, and next year's overlay. Pick any date (or step a year at a time) to
  see the period and year it falls in; the chart's highlights follow.
- **More:** unsure of the hour? The life palace for each of the 12 hours, to tap and try. Saved charts, charts saved
  in the BaZi app (if they have a time), share links (the same format as BaZi's), and a 中文 / EN switch.
- **Method:** the common 紫微斗数全书 rules (`src/ziwei.js`). The year changes at the lunar new year, a leap-month birth
  counts as that month to the 15th and the next month from the 16th, and 庚 years transform 太阳 武曲 太阴 天同.
  Checked against the open-source [iztro](https://github.com/SylarLong/iztro) library on nearly 5,000 random charts
  with identical results. Star brightness (庙旺利陷) isn't shown yet.

### 🧭 Feng Shui (`fengshui/`)

Flying Star (玄空飞星) and Eight Mansions (八宅) feng shui for a home and the people in it.

- **Home:** enter the main door's facing in degrees and the move-in date. The app works out the period (20-year
  元运, Period 9 is 2024–2043, from 立春), the facing and sitting mountains of the 24, and draws the flying star
  chart: base, mountain (people, health) and facing (money) stars in each of the nine palaces, coloured by whether
  they are timely in the period. Replacement stars (替卦) are used automatically when the facing is more than 4.5°
  off the centre of its mountain, and can be switched off. It names the chart type (旺山旺向, 上山下水, double
  stars at the facing or sitting), 合十, 父母三般卦, 连珠, 伏吟/反吟 and boundary (空亡) facings, and the house
  trigram. Tap a sector for its stars, combinations (e.g. 2-5, 1-4, 6-8), what it suits, this year's star and
  afflictions there, and how each household member finds it. The grid can be drawn south-up or north-up.
- **Floor plan:** add a photo, screenshot or PDF of the floor plan (e.g. an HDB plan) and drag the 3×3 grid onto
  the flat's outer walls (it starts on the walls it finds, turned to match a tilted scan; drag corners or
  edges, turn it freely, zoom in, or rotate the plan 90°). Tap the main door on the plan (or pick its side); a compass is drawn on the plan from the measured facing, to compare with the plan's north arrow, and for plans without one the app lists which way each outer wall should face so it can be checked at a window. The grid follows the walls, with the front middle
  square as the facing. Each room then shows its stars (or a person's Eight Mansions directions), squares outside
  an L-shaped flat can be marked as missing corners, and tapping a square gives its reading. The plan is kept in
  the browser's IndexedDB; PDFs are rendered with pdf.js from the CDN.
- **Family roles:** each person can be given a role (father, mother, eldest son, …). Each trigram stands for a
  family member, so sector readings, missing corners and the year's 5 Yellow and 2 Black say who they affect.
- **People:** each person's Kua number (from the 立春 year and gender) with their four good and four bad directions
  (生气, 天医, 延年, 伏位 / 祸害, 五鬼, 六煞, 绝命), East or West group, and desk and bed tips. Charts saved in the
  BaZi app can be imported, which adds the directions of their favourable elements.
- **Year:** the annual flying stars with Tai Sui, the Year Breaker, Three Killings, 5 Yellow and 2 Black, the twelve
  monthly stars with their start dates, and this month's star in each sector.
- **Compass:** uses the phone's compass (magnetic north, as a luopan does) on a 24-mountain dial; the reading can be
  sent to the Home tab. Without a sensor, set the degrees by hand.
- The calculations are in `src/fengshui.js`; schools differ, and the app says which method it uses.

### 🤖 AI for Beginners (`learnai/`)

Eighteen short lessons on AI in plain English or Simplified Chinese, at two levels (中文 / EN switch in the header; phones set to
Chinese start in Chinese), each a few cards and a three-question quiz, with progress kept on the device.

- **Chinese version:** `learnai/lessons-zh.js` mirrors `lessons.js` (a test checks they match). The demos work in
  Chinese too: the word predictor's sentences are written with spaces between words, and the scam filter reads
  Chinese in two-character pieces, so it copes with everyday text typed without spaces.

- **Intermediate level** (8 lessons, unlocked visually once the beginner ones are done, though any lesson can be
  opened): giving context and examples, step-by-step reasoning and reasoning models, search and sources (RAG),
  photos, voice and files, agents and prompt injection, AI that just agrees with you (sycophancy), privacy
  settings and the PDPA, and building AI into a routine. Its "judge" games (is this answer backed up? should the
  agent go ahead? neutral or leading? OK to share?) are defined in the lesson data, so they're translated with it.
- **Lessons:** what AI is, how it learns, how chatbots write, tokens, why AI makes things up, how to prompt,
  what it's good and bad at, staying safe (privacy, voice-clone and deepfake scams, ScamShield), pictures and
  deepfakes, and using AI every day.
- **Hands-on demos** that really work, in the browser (`src/learnai.js`): teach a scam filter (naive Bayes) and
  test it on new messages; be the chatbot with a next-word predictor and a temperature slider; split text into
  rough tokens; a prompt builder; a trust-or-check game; and a good-use-or-careful sorting game.
- **Prompts:** ready-made prompts to copy (explain a letter, cook with what's in the fridge, homework hints…).
- **Words:** a searchable glossary.

### 📱 Go Digital (`godigital/`)

Picture guides that teach seniors to use everyday apps, in English, 中文 or Burmese (မြန်မာ). Each step shows a
simplified phone screen with the button to press glowing and a hand pointing at it; tapping it moves on, like the
real thing. One short sentence per step, a 🔊 read-aloud button (using the phone's own voices), and a bigger-text
switch.

- **Grab:** create an account, book a ride (check the car plate), order food, save places, add a card, car types
  (JustGrab, taxi, 6-seater, GrabFamily, GrabAssist for seniors and foldable wheelchairs, Premium; what to do with a
  wheelchair that can't fold), and staying safe.
- **FairPrice:** create an account, and order groceries for delivery (search, add, cart, delivery slot, checkout).
- **DBS digibank:** log in and check your balance, PayNow (check the "Name on PayNow" before sending), scan a QR
  code to pay, pay a bill (Pay & Transfer → Bills, Cards & GIRO), and staying safe from scams (SMS links; the
  Safety Switch, which is turned on by calling the DBS Fraud Hotline 1800 339 6963; ScamShield 1799). These steps
  show DBS's own screenshots, from its help pages and its handbook "Your simple guide to digibank" (dbs.com.sg),
  cropped to the screen (`godigital/shots/`), with the buttons laid over them and a "PRACTICE" watermark; the login
  screen also says never to type your PIN on a website.
- **Content** lives in `src/godigital.js`: lessons are lists of steps; a step shows either a screenshot (`SHOTS`: its
  height and the buttons on it, as percentages of the picture) or a drawn screen (small HTML builders). Tests check
  every step's button exists on its screen, every screenshot is there at the size listed, and every step is in all
  three languages.
- Grab and FairPrice are still simplified drawings, until there are real screenshots for them. The app says it isn't
  made by or linked to Grab, FairPrice or DBS.

### 🌙 Tarot (`tarot/`)

Tarot readings with the full 78-card Rider–Waite–Smith deck, in Pamela Colman Smith's original 1909 art (public
domain; scans from Wikimedia Commons, resized in `tarot/cards/`).

- **Card of the day:** one card, the same all day and different each day (from the date and a seed kept on the
  device); tap to turn it over.
- **Readings:** an optional question, then a spread: one card, Past · Present · Future, Situation · Action · Outcome,
  Relationship, Two paths, or the ten-card Celtic Cross (laid out as the classic cross and staff). Shuffle with a
  fair Fisher–Yates shuffle from the device's secure random numbers, then tap each card to turn it over. Cards can
  come out reversed (or not, if you switch that off). Each card is read in its place, and a summary notes what the
  mix says: many Major Arcana, a strong suit, court cards, reversals, Aces.
- **Cards:** all 78 with their upright and reversed meanings, filtered by suit or searched (“love”, “money”).
- **Learn:** what tarot is, the Major and Minor Arcana, the suits and their elements, court cards, reversals, how
  to ask a good question and how to read a spread.
- **Journal:** save a reading with your notes and look back later. Kept on the device; included in backups.
- Meanings follow the Rider–Waite tradition, written short and plain, in `src/tarot.js`. For reflection and fun.

The home screen also links to [Web Monopoly](https://mangoomeh.github.io/web-monopoly/),
[Morning Pick](https://mangoomeh.github.io/morning-pick/) and
[Deliberate](https://mangoomeh.github.io/deliberate/).

## Running it

```sh
npm start        # serves the apps at http://localhost:8000
npm test         # runs the unit tests (Node 18+)
npm run sw       # updates the offline file list in sw.js; run after adding or changing files
npm run icons    # redraws the icons and manifests (Python 3 + Pillow + Noto Color Emoji); run after adding an app
```

The tests fail if `sw.js` is out of date, so a forgotten `npm run sw` stops the deploy rather than shipping an old
offline copy.

Every push to `main` runs the tests and publishes to GitHub Pages (`.github/workflows/pages.yml`).

## Layout

- `index.html`: the home screen with a tile for each app, and Backup
- `sw.js`, `shared/pwa.js`: offline use (every page loads `pwa.js`, which registers the service worker)
- `manifest.webmanifest` in each folder, and `icons/`: what a phone uses when an app is added to the home screen
- `shared/styles.css`: shared styles, including the Sushiro theme
- `shared/ui.js`: helpers every app uses (`$`, `esc`, `toast`, `switchTab`); `shared/backup.js`: the Backup card
- `petty-cash/`, `sushiro/`, `split/`, `trip/`, `ziwei/`, `calc84/`, `wallets/`, `bazi/`, `fengshui/`, `learnai/`, `godigital/`, `tarot/`: each app's page and UI script (`sushiro/ocr.js` and `sushiro/photos.js` handle receipts)
- `src/`: the logic as pure functions (`cash.js`, `sushiro.js`, `split.js`, `trip.js`, `sync.js` (share links and merging), `backup.js`, `receipt.js`, `ti84.js`, `onchain.js`, `bazi.js`, `baziread.js`, `bazimatch.js`, `ziwei.js`, `fengshui.js`, `plangrid.js`, `places.js`, `learnai.js`, `compass.js`), with all money in integer cents
- `tests/`: unit tests for `src/`, plus checks that the offline and install files are complete
- `tools/`: `build-sw.js` (offline file list) and `build-pwa.py` (icons and manifests)

To add an app: create a folder with an `index.html` (copy the `<head>` of another app, which links its manifest,
icon and `pwa.js`), add a tile to the root `index.html`, add the folder to `APPS` in `tools/build-sw.js` and
`tools/build-pwa.py` and to the `cp` line in the Pages workflow, add its storage key to `STORAGE_KEYS` in
`src/backup.js`, then run `npm run icons` and `npm run sw`.

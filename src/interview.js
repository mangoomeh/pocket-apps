// The interview question bank: common questions by category, each with a short tip on what
// the interviewer is really asking. Answers and "practised" marks are kept by the app.

export const CATEGORIES = [
  { id: 'intro', name: 'About you', icon: '👋' },
  { id: 'motivation', name: 'Why this job', icon: '🎯' },
  { id: 'behavioural', name: 'Past experience', icon: '⭐' },
  { id: 'strengths', name: 'Strengths & growth', icon: '💪' },
  { id: 'situational', name: 'What would you do', icon: '🧩' },
  { id: 'teamwork', name: 'Working with others', icon: '🤝' },
  { id: 'practical', name: 'Pay & practical', icon: '💰' },
  { id: 'ask', name: 'Questions to ask them', icon: '❓' },
];

// [id, category, question, tip]. Ids never change, so saved answers stay attached.
const RAW = [
  ['intro-1', 'intro', 'Tell me about yourself.', 'Not your life story: 60–90 seconds on who you are at work now, one or two things you\'ve done that fit this role, and why you\'re here today. Present → past → future.'],
  ['intro-2', 'intro', 'Walk me through your CV.', 'Pick the thread that leads to this job. Spend most of the time on your last one or two roles, and say why you made each move.'],
  ['intro-3', 'intro', 'How would your colleagues describe you?', 'Give two or three words and a quick example for one of them. Bonus if it\'s something a manager actually said in a review.'],
  ['intro-4', 'intro', 'What are you most proud of in your career so far?', 'Choose something with a clear result you caused. Say what was hard about it, what you did, and what changed because of you.'],
  ['intro-5', 'intro', 'Why are you looking to leave your current job?', 'Stay positive: talk about what you\'re moving towards (scope, growth, the kind of work), not what you\'re escaping. Never criticise your current employer.'],
  ['intro-6', 'intro', 'Can you explain this gap in your CV?', 'Be brief and matter-of-fact (caring for family, study, health, a deliberate break), then move to what you did to stay sharp and why you\'re ready now.'],

  ['mot-1', 'motivation', 'Why do you want to work here?', 'Show you\'ve done your homework: one thing about the company (product, mission, a recent move) and one about the team or role, tied to what you care about.'],
  ['mot-2', 'motivation', 'Why are you interested in this role?', 'Match two or three things from the job ad to things you\'ve done and enjoy. They want to hear that you\'d be good at it and stay motivated.'],
  ['mot-3', 'motivation', 'What do you know about our company?', 'Mention what they do, who their customers are and something recent (news, a launch, results). Finish with what excites you about it.'],
  ['mot-4', 'motivation', 'Where do you see yourself in five years?', 'They\'re checking ambition and fit, not a promise. Describe the skills and responsibility you want to grow into, in a direction this job leads.'],
  ['mot-5', 'motivation', 'What are you looking for in your next role?', 'Name a few things this role genuinely offers. Being specific (a type of problem, a team size, a skill to build) sounds more credible than "growth".'],
  ['mot-6', 'motivation', 'Why should we hire you?', 'Sum up in three points: the skills that match their biggest needs, proof you\'ve used them, and what you\'d bring that others might not.'],

  ['beh-1', 'behavioural', 'Tell me about a time you faced a difficult challenge at work.', 'Use STAR. Pick a real obstacle, focus on the actions you took (say "I", not "we"), and end with the result and what you learnt.'],
  ['beh-2', 'behavioural', 'Describe a time you made a mistake. What happened?', 'Choose a real but recoverable mistake. Own it without excuses, show how you fixed it, and what you now do differently.'],
  ['beh-3', 'behavioural', 'Tell me about a time you had to meet a tight deadline.', 'Show how you prioritised, what you said no to or delegated, and how you kept people informed. A number (days, hours) makes it vivid.'],
  ['beh-4', 'behavioural', 'Give an example of a time you showed leadership.', 'Leadership doesn\'t need a title: leading a project, mentoring someone, or rallying people around a fix all count. Show how you got others on board.'],
  ['beh-5', 'behavioural', 'Tell me about a time you failed.', 'They\'re testing self-awareness. Pick a genuine failure, explain why it happened, and spend most of your answer on what you learnt and changed.'],
  ['beh-6', 'behavioural', 'Describe a time you had to learn something new quickly.', 'Explain how you learnt (who you asked, what you read, how you practised) and how soon you were delivering with it.'],
  ['beh-7', 'behavioural', 'Tell me about a time you improved a process.', 'Before and after: what was slow or broken, the change you made, and the measurable difference (time saved, errors cut, money saved).'],
  ['beh-8', 'behavioural', 'Give an example of when you went above and beyond.', 'Pick something that helped a customer or the team, not just long hours. Say why you chose to do it.'],
  ['beh-9', 'behavioural', 'Tell me about a decision you made with incomplete information.', 'Show your reasoning: what you knew, what you assumed, how you limited the risk, and how you checked afterwards.'],

  ['str-1', 'strengths', 'What is your greatest strength?', 'Pick one that matters for this job and prove it with a short example. A strength with evidence beats a list of adjectives.'],
  ['str-2', 'strengths', 'What is your biggest weakness?', 'Choose a real one that isn\'t central to the job, and show what you\'re doing about it. Avoid disguised boasts like "I work too hard".'],
  ['str-3', 'strengths', 'What feedback have you received that changed how you work?', 'Show you can hear criticism: what you were told, how you reacted, and what you do differently now.'],
  ['str-4', 'strengths', 'How do you keep your skills up to date?', 'Be specific: courses, communities, side projects, people you learn from. Mention something you picked up recently.'],
  ['str-5', 'strengths', 'What motivates you?', 'Be honest and connect it to the work: solving hard problems, helping customers, building things, learning. Give a moment it showed.'],
  ['str-6', 'strengths', 'How do you handle stress and pressure?', 'Describe your actual habits (planning, breaking work down, asking for help early) and a time they got you through.'],

  ['sit-1', 'situational', 'What would you do in your first 90 days here?', 'Listen and learn first (people, product, customers), then a few quick wins, then a bigger plan. Shows you won\'t barge in or sit idle.'],
  ['sit-2', 'situational', 'What would you do if you disagreed with your manager\'s decision?', 'Raise it privately with reasons and data, listen to theirs, and once it\'s decided, commit to it. Shows backbone and maturity.'],
  ['sit-3', 'situational', 'How would you handle several urgent tasks at once?', 'Explain how you\'d judge impact and deadlines, check priorities with the people involved, and communicate what will slip.'],
  ['sit-4', 'situational', 'What would you do if you realised you couldn\'t meet a deadline?', 'Flag it early, explain why, offer options (less scope, more time, more help) and a new date you can keep.'],
  ['sit-5', 'situational', 'How would you deal with an unhappy customer?', 'Listen fully, acknowledge how they feel, find out what they need, fix what you can, and follow up. A real example helps.'],
  ['sit-6', 'situational', 'What would you do if a teammate wasn\'t pulling their weight?', 'Start with a private, curious conversation (they may be struggling), agree how to move forward, and only escalate if it doesn\'t change.'],

  ['team-1', 'teamwork', 'Tell me about a time you disagreed with a colleague.', 'Show you focus on the problem, not the person: how you understood their view, found common ground and what you decided together.'],
  ['team-2', 'teamwork', 'Describe your ideal manager or working style.', 'Be honest but flexible. Describe what helps you do your best work, and show you can adapt to different styles.'],
  ['team-3', 'teamwork', 'How do you work with people from other teams?', 'Give an example of building a relationship across teams: understanding their goals, keeping them informed and sharing credit.'],
  ['team-4', 'teamwork', 'Tell me about a time you helped a struggling teammate.', 'Show empathy and practical help, and how you did it without taking over their work.'],
  ['team-5', 'teamwork', 'How do you give difficult feedback?', 'Be specific and kind: talk about the behaviour and its effect, in private, soon after, and agree next steps.'],

  ['prac-1', 'practical', 'What are your salary expectations?', 'Research the market first (job ads, MyCareersFuture, Glassdoor, friends). Give a range whose bottom you\'d be happy with, or ask for their budget first.'],
  ['prac-2', 'practical', 'What is your notice period?', 'Know it exactly (check your contract). If it\'s long, say whether you could negotiate it or offset leave.'],
  ['prac-3', 'practical', 'Are you interviewing anywhere else?', 'It\'s fine to say yes without naming companies. It shows you\'re in demand; add that this role is high on your list if true.'],
  ['prac-4', 'practical', 'Are you comfortable with the hours, travel or office days?', 'Know the arrangement before the interview and answer honestly. If you need flexibility, say so now, not after an offer.'],
  ['prac-5', 'practical', 'When could you start?', 'Give a realistic date after your notice period, plus a short break if you want one. Don\'t promise to leave your current job without notice.'],

  ['ask-1', 'ask', 'What does success look like in this role after six months?', 'Shows you\'re already thinking about delivering. Their answer tells you what really matters to them.'],
  ['ask-2', 'ask', 'What are the biggest challenges facing the team right now?', 'Helps you understand the real job, and gives you a chance to say how you\'d help.'],
  ['ask-3', 'ask', 'How would you describe the team\'s culture?', 'Listen for specifics. Follow up with "Can you give me an example?" if the answer is vague.'],
  ['ask-4', 'ask', 'What do you enjoy most about working here?', 'People usually answer honestly, and a long pause tells you something too.'],
  ['ask-5', 'ask', 'How is performance reviewed, and how do people grow here?', 'Shows you plan to stay and improve. Ask about training, promotion and mentoring.'],
  ['ask-6', 'ask', 'What are the next steps in the process?', 'Always ask at the end, so you know when to expect news and when it\'s reasonable to follow up.'],
  ['ask-7', 'ask', 'Is there anything about my background that makes you hesitate?', 'Bold but useful: it lets you address a concern while you\'re still in the room.'],
];

export const QUESTIONS = RAW.map(([id, cat, q, tip]) => ({ id, cat, q, tip }));

// The STAR method, for answering "tell me about a time…" questions.
export const STAR = [
  ['S', 'Situation', 'Set the scene in a sentence or two: where, when, what was going on.'],
  ['T', 'Task', 'What you needed to achieve, or the problem to solve.'],
  ['A', 'Action', 'What you did, step by step. Most of your answer goes here; say "I", not "we".'],
  ['R', 'Result', 'What happened because of you, with a number if you can, and what you learnt.'],
];

// The built-in questions plus the user's own, filtered by category ('all', 'mine' or an id)
// and a search across question and tip.
export function questionList(custom = [], { cat = 'all', query = '' } = {}) {
  const mine = custom.map((c) => ({ ...c, cat: 'mine', tip: c.tip || '', mine: true }));
  const q = query.trim().toLowerCase();
  return [...mine, ...QUESTIONS].filter((x) => (cat === 'all' || (cat === 'mine' ? x.mine : x.cat === cat))
    && (!q || x.q.toLowerCase().includes(q) || x.tip.toLowerCase().includes(q)));
}

// A question to practise: one not yet practised if there is one, never the one just shown.
export function pickPractice(list, practised = {}, lastId = null, rand = Math.random) {
  const fresh = list.filter((x) => !practised[x.id] && x.id !== lastId);
  const pool = fresh.length ? fresh : list.filter((x) => x.id !== lastId);
  const from = pool.length ? pool : list;
  return from.length ? from[Math.floor(rand() * from.length)] : null;
}

// ---- My questions --------------------------------------------------------------------------
// The questions you're preparing: ones picked from the bank and your own, in the order you added
// them (`favs` holds both kinds of id). Everything else in the bank can be ignored.

// A quick start: the ten questions asked in almost every interview.
export const MOST_ASKED = ['intro-1', 'mot-1', 'mot-6', 'beh-1', 'str-1', 'str-2', 'intro-5', 'mot-4', 'beh-2', 'prac-1'];

// Earlier versions had no favourites: start them with your own questions and any bank question
// you'd already answered, so nothing you wrote disappears.
export function withFavs(prep = {}) {
  if (Array.isArray(prep.favs)) return prep;
  const answered = QUESTIONS.filter((q) => String(prep.answers?.[q.id] || '').trim()).map((q) => q.id);
  return { ...prep, favs: [...(prep.custom || []).map((c) => c.id), ...answered] };
}

export function myQuestions(prep = {}) {
  const all = Object.fromEntries(questionList(prep.custom || []).map((q) => [q.id, q]));
  return (prep.favs || []).map((id) => all[id]).filter(Boolean);
}

export const isFav = (prep, id) => (prep.favs || []).includes(id);

// Adds a bank question to My questions, or takes it out (your answer is kept, in case you add it back).
export function toggleFav(prep, id) {
  prep.favs = isFav(prep, id) ? prep.favs.filter((x) => x !== id) : [...(prep.favs || []), id];
  return prep;
}

export function addCustom(prep, id, text) {
  prep.custom = [...(prep.custom || []), { id, cat: 'mine', q: text }];
  prep.favs = [...(prep.favs || []), id];
  return prep;
}

// Your own questions are deleted outright, with their answers.
export function removeCustom(prep, id) {
  prep.custom = (prep.custom || []).filter((c) => c.id !== id);
  prep.favs = (prep.favs || []).filter((x) => x !== id);
  delete prep.answers?.[id];
  delete prep.practised?.[id];
  return prep;
}

// How far along a set of questions is: drafted (has your answer) and practised, counted separately.
export function progressOf(list, answers = {}, practised = {}) {
  return {
    total: list.length,
    drafted: list.filter((q) => String(answers[q.id] || '').trim()).length,
    practised: list.filter((q) => practised[q.id]).length,
  };
}

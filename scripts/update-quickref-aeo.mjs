#!/usr/bin/env node
/**
 * update-quickref-aeo.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * AEO update pass for the 27 quick-reference one-pager .html files.
 * For each file:
 *   1. Adds `datePublished` + `dateModified` to the existing Article JSON-LD.
 *   2. Adds a FAQPage JSON-LD block.
 *   3. Adds a visible publish date to the page header.
 *   4. Adds a styled Common Questions section before <div class="action-bar">.
 *
 * Run once from repo root:
 *   node scripts/update-quickref-aeo.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── ARTICLE METADATA ──────────────────────────────────────────────────────

const ARTICLES = {
  'psychological-safety':          { date: '2026-04-28', title: 'Psychological Safety | Scaling Minds' },
  'trust-repair':                  { date: '2026-06-20', title: 'Trust Repair — After a Breakdown | Scaling Minds' },
  'vulnerability-leadership':      { date: '2026-06-22', title: 'Vulnerability as a Leadership Tool | Scaling Minds' },
  'agreements-vs-expectations':    { date: '2026-01-13', title: 'Agreements vs. Expectations | Scaling Minds' },
  'cost-of-silence':               { date: '2026-06-09', title: 'The Cost of Silence | Scaling Minds' },
  'candor-vs-politeness':          { date: '2026-01-27', title: 'Candor vs. Politeness | Scaling Minds' },
  'feedback-vs-criticism':         { date: '2026-02-24', title: 'Feedback vs. Criticism | Scaling Minds' },
  'intention-vs-impact':           { date: '2026-03-17', title: 'Intention vs. Impact | Scaling Minds' },
  'perception-vs-perspective':     { date: '2026-04-07', title: 'Perception vs. Perspective | Scaling Minds' },
  'micromanagement':               { date: '2026-03-24', title: 'Micromanagement | Scaling Minds' },
  'people-pleasing':               { date: '2026-03-31', title: 'People-Pleasing in Leaders | Scaling Minds' },
  'reactive-vs-responsive':        { date: '2026-05-05', title: 'Reactive vs. Responsive Leadership | Scaling Minds' },
  'caretaker-trap':                { date: '2026-06-02', title: 'The Caretaker Trap | Scaling Minds' },
  'expert-trap':                   { date: '2026-06-12', title: 'The Expert Trap | Scaling Minds' },
  'decision-fatigue':              { date: '2026-02-03', title: 'Decision Fatigue | Scaling Minds' },
  'burnout-vs-stress':             { date: '2026-01-20', title: 'Burnout vs. Stress | Scaling Minds' },
  'prioritization-vs-busyness':    { date: '2026-04-21', title: 'Prioritization vs. Busyness | Scaling Minds' },
  'strategic-vs-operational-thinking': { date: '2026-05-12', title: 'Strategic vs. Operational Thinking | Scaling Minds' },
  'playing-to-win':                { date: '2026-04-14', title: 'Playing to Win vs. Playing Not to Lose | Scaling Minds' },
  'imposter-syndrome':             { date: '2026-03-10', title: 'Imposter Syndrome | Scaling Minds' },
  'loneliness-of-leadership':      { date: '2026-06-18', title: 'The Loneliness of Leadership | Scaling Minds' },
  'four-questions':                { date: '2026-02-10', title: "Don't Believe Everything You Think | Scaling Minds" },
  'emotional-regulation':          { date: '2026-02-17', title: 'Emotional Regulation Under Pressure | Scaling Minds' },
  'hero-vs-host-leadership':       { date: '2026-03-03', title: 'Hero vs. Host Leadership | Scaling Minds' },
  'the-leader-you-think-you-are':  { date: '2026-06-16', title: 'The Leader You Think You Are | Scaling Minds' },
  'what-got-you-here':             { date: '2026-06-23', title: 'What Got You Here Won\'t Get You There | Scaling Minds' },
  'accountability-gap':            { date: '2026-05-26', title: 'The Accountability Gap | Scaling Minds' },
};

// ─── FAQ DATA ──────────────────────────────────────────────────────────────

const FAQS = {
  'psychological-safety': [
    {
      q: 'What is psychological safety and why does it matter?',
      a: `Psychological safety is the belief that you can speak up, disagree, ask a dumb question, or admit a mistake without getting punished for it. Google studied hundreds of teams for two years and found it was the single biggest predictor of team performance, more than talent, more than experience, more than how smart the people in the room were. When it's missing, people do their jobs and keep their mouths shut. When it's present, the real work actually gets done.`,
    },
    {
      q: 'How do you know if your team has psychological safety?',
      a: `Watch where people's eyes go when a hard question lands in a meeting. If every set of eyes finds the CEO's chair, waiting to see what he thinks before they form an opinion, you don't have psychological safety. You have a group of smart people performing alignment. The other tell: the real conversation happens after the meeting, in the hallway, in the parking lot, in a text thread. If that's where decisions actually get made, the meeting room isn't safe.`,
    },
    {
      q: 'Is psychological safety the same as being nice to each other?',
      a: `No, and confusing the two causes a lot of damage. Psychological safety is not comfort, niceness, or the absence of tension. Teams with high psychological safety can have sharp disagreements, push back hard on each other's ideas, and sit in real conflict without it becoming personal. What they don't do is punish people for raising a concern or make it costly to be wrong in public. The safest teams I've worked with are often the loudest ones in the room. Niceness is a ceiling. Safety is a floor.`,
    },
    {
      q: 'Can you have psychological safety and still hold people accountable?',
      a: `Yes, and you need both. A team where everyone feels safe but nobody's accountable is a nice place to work and a slow place to grow. The research is clear on this: psychological safety and high standards aren't opposites, they're a combination. Safety makes it possible for people to admit when something's off track. Accountability makes sure something actually changes. Without safety, accountability becomes policing. Without accountability, safety becomes permission to coast.`,
    },
  ],
  'trust-repair': [
    {
      q: 'How do you rebuild trust with your team after breaking it?',
      a: `You rebuild it through behavior, not words. The apology matters, but what happens in the two weeks after the apology is what actually counts. The teams I've watched repair trust successfully all did the same thing: the leader named what happened clearly, took full responsibility without softening it, and then changed how they showed up in situations similar to the one that caused the break. Not new situations. The same kind of situation that went wrong the first time. That's when people start to believe the repair is real.`,
    },
    {
      q: 'How long does it take to rebuild trust after a leadership failure?',
      a: `Longer than most leaders want to hear. You'll see the first real signs, people being a little more honest in meetings, a little less guarded, usually within a few months of consistent changed behavior. Full repair, where the team genuinely trusts you again the way they did before, is closer to a year. Anyone telling you it's a 30-day fix is selling something. The timeline isn't about the severity of the break as much as it's about the consistency of what comes after it.`,
    },
    {
      q: 'Does apologizing actually rebuild trust?',
      a: `An apology opens the door. It does not walk through it. The research on this is pretty unambiguous: the apology sets the stage, but behavior is the evidence. What I see most often is leaders who apologize well and then gradually drift back to the old patterns over the next few months, usually without realizing it. The team notices every time. And each time they notice, the apology retroactively loses credibility. The apology isn't the repair. It's just the start of the repair.`,
    },
    {
      q: "What's the difference between repairing trust and performing repair?",
      a: `Repair is when the behavior changes. Performance is when the communication about changing changes, but the behavior stays the same. You can tell the difference pretty quickly. Performed repair shows up in announcements, all-hands talks, new values written on the wall. Real repair shows up in the next hard decision, when the leader does the thing they said they'd do differently. The team is watching that specific moment, not the speech. They've heard the speech.`,
    },
  ],
  'vulnerability-leadership': [
    {
      q: 'Does showing vulnerability make leaders look weak?',
      a: `The research says the opposite, pretty convincingly. DDI tracked nearly 300 leaders over two and a half years and found that employees were 5.3 times more likely to trust a leader who regularly showed vulnerability, and 7.5 times more likely to trust someone who genuinely acknowledged their own failures. The fear of looking weak by being honest is real, but the actual outcome of being honest is more trust, not less. Leaders who never admit doubt or uncertainty don't read as strong. They read as hard to reach.`,
    },
    {
      q: 'What does vulnerability actually look like in a leadership meeting?',
      a: `It looks like saying "I got that wrong" when you got something wrong, without immediately pivoting to why it wasn't entirely your fault. It looks like asking "what am I missing here?" and actually waiting for the answer. It looks like telling your team you're not sure how to handle something before you've already decided, and meaning it. None of that requires oversharing or emotional disclosure. It just requires being honest about uncertainty in real time, which most leaders have been trained out of doing by the time they hit the executive level.`,
    },
    {
      q: 'How do you be vulnerable as a leader without oversharing?',
      a: `The line is professional relevance. Sharing that you've struggled with a decision, that you made a mistake and learned from it, that you're working through something you don't fully understand yet, all of that is useful. It gives people permission to be honest too. Sharing personal life details that your team has no context for and no way to respond to is a different thing, and it puts people in an awkward position. The question is whether what you're sharing helps the team work better together. If the answer is yes, say it. If the answer is no, keep it.`,
    },
    {
      q: 'Why do employees trust vulnerable leaders more?',
      a: `Because vulnerability signals that the leader isn't managing their image at the expense of the truth. When a leader is willing to say something that might make them look less certain or less capable, the team learns that what they say is what they actually mean. When every message is polished, every answer is confident, and every decision arrives fully formed, the team starts to wonder what's being withheld. Honest uncertainty turns out to be more reassuring than performed confidence.`,
    },
  ],
  'agreements-vs-expectations': [
    {
      q: "What's the difference between an expectation and an agreement at work?",
      a: `An expectation is something you want from someone that you haven't actually said out loud or gotten their buy-in on. An agreement is something you've both talked through, both committed to, and both understand clearly. The reason this distinction matters is that people tend to keep agreements and resist expectations. Not because they're difficult, but because expectations put all the weight on one side. Both people had a say in it, so both people feel ownership over it.`,
    },
    {
      q: 'Why do employees resist expectations but keep agreements?',
      a: `Expectations feel like demands dropped from above. Even reasonable ones. When you tell someone what you expect of them, the implicit message is that your standards are the ones that matter, and their job is to meet them. Agreements flip that. Both people contribute to what the commitment looks like, which means the person on the receiving end isn't just complying, they're keeping their word. Built together, kept together. That's a completely different internal experience, and it shows up in the behavior. People honor commitments they made. They comply with, and often quietly resist, demands they received.`,
    },
    {
      q: 'How do you turn an expectation into an agreement?',
      a: `Say it out loud and ask if they can commit to it. That's most of it. "I need the weekly report by Thursday morning. Does that work for you, and is there anything you'd need from me to make that happen?" The key is that last part: asking what they need from you. An agreement is a two-way thing. If they can't meet the expectation as stated, now you find out why before it becomes a problem, not after. If they can, you have a real commitment instead of an assumed one.`,
    },
    {
      q: 'What happens when expectations go unstated on a team?',
      a: `They become invisible standards that people get judged against without knowing the game they're playing. The organizational psychologist William Schutz put it well: unexpressed expectations are premeditated resentments. The leader is disappointed. The employee is blindsided. And the conversation that follows, if it happens at all, starts with a deficit of trust on both sides because the employee had no idea the expectation existed. Most accountability problems I see on leadership teams aren't performance problems. They're clarity problems that nobody named.`,
    },
  ],
  'cost-of-silence': [
    {
      q: "Why don't employees speak up even when they see a problem?",
      a: `Because they've learned it's not safe to. That lesson usually comes from one or two moments early on where someone raised something honest and it went badly for them. Maybe they got shut down in the meeting, maybe the boss got defensive, maybe it just quietly disappeared and nothing changed. That's enough. After that, the rational move is to keep your head down, and the team collectively learns to say what's safe instead of what's true. The silence isn't about the individuals. It's about what the culture has taught them to expect.`,
    },
    {
      q: 'What does silence in a leadership team actually signal?',
      a: `It signals that disagreement has become too expensive. In every leadership team where I see a lot of silence in the room, the real conversations are happening somewhere else, in the hallway after the meeting, in one-on-ones with the CEO, in a group text. The meeting itself becomes a performance of alignment. Decisions look fast and clean until you realize they weren't actually decisions, they were the CEO's preference with no one in the room willing to complicate it. That feels like efficiency. It's actually a slow leak.`,
    },
    {
      q: 'How do you create a culture where people tell the truth?',
      a: `You make truth-telling less costly than silence. That's the whole thing. You do it by thanking the person who slows the meeting down with a hard question, not just tolerating it, actually thanking them. You do it by sharing something honest yourself before you ask for honesty from others. You do it by not reacting badly the first time someone tells you something you don't want to hear. One bad reaction after a hundred good ones resets the clock. The team is always watching what happens to the person who speaks up.`,
    },
    {
      q: 'What is silence costing my organization?',
      a: `More than most leaders realize, and it almost never shows up in a report. Decisions get made without the information that would have changed them. Problems that people saw coming get ignored until they're expensive. Gallup estimates that disengaged employees, silence being one of the primary drivers, cost the U.S. economy around $605 billion a year in lost productivity. At the team level, the cost is simpler to see: count how many decisions in the last quarter got made, and then made again after the real objections finally surfaced. That's what silence costs.`,
    },
  ],
  'candor-vs-politeness': [
    {
      q: "What's the difference between candor and being rude?",
      a: `Candor is saying the hard thing because you care what happens. Rudeness is saying the hard thing because you don't. The intent is completely different, and so is the delivery. Candor names a problem specifically, stays focused on the work, and treats the person on the other end as someone capable of handling the truth. Rudeness attacks, generalizes, or uses honesty as cover for contempt. A candid leader can say "this plan won't work and here's why" without making the person who wrote it feel like an idiot. That's the whole distinction.`,
    },
    {
      q: 'Why do polite teams underperform?',
      a: `Because polite teams don't tell each other the truth. They have smooth meetings and bad outcomes. Problems get noticed but not named. Decisions get made without the information that would have changed them. The politeness isn't malicious. Most people genuinely believe they're being kind by staying quiet, and the effect is the same: the team operates on a filtered version of reality where everyone is performing alignment instead of actually achieving it. I've never worked with a leadership team that was too candid. I've worked with dozens that were too polite.`,
    },
    {
      q: "How do you build a culture of candor without destroying morale?",
      a: `You start by modeling it yourself, and you do it in a way that makes clear the candor is in service of the team, not a license to unload. The first move is almost always the same: say something true in a meeting that's slightly uncomfortable to say, and don't soften it into meaninglessness. Not cruel, just honest. When the team sees you do that and nothing bad happens, the signal goes out that this is allowed here. Morale doesn't suffer from candor. It suffers from the chronic stress of never being able to say what's actually true.`,
    },
    {
      q: 'Is it possible to be too candid?',
      a: `Yes, in the same way it's possible to be too direct, when the honesty is accurate but the timing, context, or delivery makes it impossible to hear. Unloading every observation without regard for the other person's capacity to receive it isn't candor, it's venting. Candor requires judgment about what's useful to say, when, and to whom. The question isn't just "is this true?" It's "will saying this help?" If the answer is no, sitting on it isn't dishonesty. It's just reading the room.`,
    },
  ],
  'feedback-vs-criticism': [
    {
      q: "What's the difference between feedback and criticism?",
      a: `Feedback is information someone can use. Criticism is a verdict. Feedback says "here's what I observed and here's what I think would make it stronger." Criticism says "here's what's wrong with you." The practical difference is that feedback is specific, forward-looking, and delivered by someone who's invested in the outcome. Criticism is usually vague, backward-looking, and delivered by someone who's frustrated. The word "constructive criticism" mostly exists because people want to feel like they're giving feedback when they're actually just softening criticism.`,
    },
    {
      q: 'Why do employees get defensive when you give them feedback?',
      a: `Usually because it doesn't actually feel like feedback to them. It feels like criticism, evaluation, or judgment, even when you meant it as help. HBR research published in 2026 found that when feedback comes across as belittling, it backfires and actually impairs performance rather than improving it. The defensiveness is a rational response to feeling assessed rather than supported. The fix isn't to soften the message to the point of uselessness. It's to make sure the relationship is strong enough that the person on the receiving end knows you're in their corner, which changes how the same words land.`,
    },
    {
      q: 'How do you give hard feedback without damaging the relationship?',
      a: `Make sure the relationship exists first. Hard feedback lands differently when someone already knows you see their strengths, that you want them to succeed, and that you're not keeping score. That's not a preamble you add to the conversation. It's the relationship you've built over time. When that foundation is there, you can say something difficult and the person can hear it as useful rather than threatening. The leaders I see damage relationships with feedback are almost always the ones who've been quiet for too long and are finally unloading, which puts the recipient in the position of absorbing a verdict rather than having a conversation.`,
    },
    {
      q: "Why don't managers give enough feedback?",
      a: `Because giving feedback feels riskier than not giving it. If I say nothing, nothing bad happens immediately. If I say something honest and it lands wrong, I now have a problem to manage. Most managers do a quick mental calculation and choose silence. The other version is the manager who's convinced their team knows they're happy because they haven't complained. That's a fantasy that costs people the information they need to grow. Feedback avoidance almost always looks like consideration from the outside. From the inside, the person on the receiving end is flying blind.`,
    },
  ],
  'intention-vs-impact': [
    {
      q: 'Why does good intention still cause harm?',
      a: `Because the person receiving your words or actions doesn't have access to your intention. They only have access to what happened. You may have meant to push someone to grow; they experienced being humiliated in front of their peers. The gap between those two things is real and it belongs to you to close, not them. Good intentions matter. They tell you something about who you're trying to be. But they don't undo the impact. "I didn't mean it that way" is almost never enough on its own. The move that actually works is stopping there and saying: I can see it landed differently, and that's on me.`,
    },
    {
      q: "How do you respond when your impact doesn't match your intention?",
      a: `Own the impact without immediately defending the intention. The instinct is to explain yourself. "I didn't mean it like that, what I was trying to say was..." and that instinct, even when the explanation is true, usually makes things worse. The person in front of you needs to know that you understand what happened to them before you can talk about what you meant. Ask what they heard. Listen to it. Acknowledge it. Then, once they feel understood, you can have a conversation about what you intended. The order matters enormously.`,
    },
    {
      q: 'Does intent matter if the impact is negative?',
      a: `Intent matters for understanding, not for accountability. Knowing that someone hurt you by accident rather than on purpose changes how you feel about them and whether you trust them going forward. But it doesn't change the fact that you were hurt. Leaders sometimes use good intentions as an argument for why they shouldn't have to do the work of repair, which is a mistake. "I didn't mean to" is a starting point for the conversation, not a conclusion to it. The work of closing the gap between intention and impact still has to happen regardless of what you meant.`,
    },
    {
      q: 'How do you close the gap between intention and impact at work?',
      a: `Get feedback on how you're actually landing, not how you think you're landing. Most leaders who have a persistent gap between intention and impact don't know they have one. They're operating on the assumption that their intent is visible. It isn't. Ask the people who report to you: "Is there anything I do that lands differently than I probably mean it?" That question takes real confidence to ask, and it's the fastest way to find out where the gap is. The teams that work on this systematically, where it's normal to name impact and talk about it, close the gap faster than any training can.`,
    },
  ],
  'perception-vs-perspective': [
    {
      q: "What's the difference between perception and perspective?",
      a: `Perception is what you see. Perspective is where you're standing when you see it. Your perception is the meaning you assign to what's in front of you, filtered through your experiences, assumptions, and history. Your perspective is the vantage point that shapes that filter in the first place. Two people can look at the same leadership decision and perceive it completely differently because they're standing in different places: one is the CFO watching the budget, one is the VP watching her team. Neither perception is wrong. Both are incomplete without the other.`,
    },
    {
      q: 'Why do two people see the same situation completely differently?',
      a: `Because they're not actually seeing the same situation. They're seeing the same event through different filters built from different experiences, different roles, different stakes. Your CFO and your VP of Sales are watching the same company and drawing completely different conclusions, and both of them are right about something the other is missing. The mistake leaders make is assuming that the person who sees it differently is either uninformed or wrong. Usually they're informed about something you're not. That's the conversation worth having.`,
    },
    {
      q: 'How does perception affect leadership decisions?',
      a: `It shapes them more than most leaders realize, because perception feels like fact. When you walk into a room and sense that something's wrong, that's a perception. It might be accurate, it might be your history with that room, it might be something else entirely. Leaders who don't examine their perceptions make decisions based on a filtered version of reality and call it instinct. The better move is to hold your perception lightly, name it as a hypothesis, and check it against what other people are seeing before you act on it.`,
    },
    {
      q: "How do you shift someone's perspective at work?",
      a: `You start by genuinely understanding theirs. People don't shift perspectives because someone presented a better argument. They shift when they feel like the other person actually gets where they're coming from, and then has something worth adding. If you try to move someone's perspective before they feel understood, the best you'll get is compliance. The real shift happens after the "you're right, and I hadn't thought about it from that angle" moment, and you can't manufacture that moment. You can only create the conditions for it by actually listening first.`,
    },
  ],
  'micromanagement': [
    {
      q: "How do I know if I'm micromanaging?",
      a: `Watch what happens when you're out of the office. If work slows down, piles up, or waits for you to come back before decisions get made, that's a signal. The other tell is in your own calendar and inbox. If you're CC'd on everything, asked to approve things that shouldn't need your approval, and find yourself editing other people's work instead of reviewing outcomes, you're probably in it. Most micromanagers don't experience themselves as controlling. They experience themselves as thorough. The team experiences it differently.`,
    },
    {
      q: 'Why do leaders micromanage?',
      a: `Almost always, it's what made them successful before they were leaders. They were the person who caught every detail, delivered on every commitment, and knew the work better than anyone. Getting promoted didn't change that instinct. It just gave it a bigger target. Add some anxiety about outcomes they're now accountable for but can't fully control, and the pull toward over-involvement makes complete sense. It isn't character failure. It's a smart person applying a skill set that no longer fits the job.`,
    },
    {
      q: 'What does micromanagement actually cost a team?',
      a: `A lot more than most leaders realize. Research by Harry Chambers found that 69% of employees considered changing jobs specifically because of micromanagement, and 71% said it directly interfered with their job performance. But the less visible cost is what doesn't get built: initiative, judgment, ownership. A team that gets corrected constantly stops trying new things. A team that never makes consequential decisions never gets good at making them. The leader thinks they're protecting quality. They're actually building a team that can't function without them.`,
    },
    {
      q: 'How do you stop micromanaging without losing quality control?',
      a: `Shift from controlling inputs to inspecting outputs. Instead of staying involved in how the work gets done, get very clear about what done looks like, and then let people figure out how to get there. When the outcome misses, you coach. When it lands, you stay out of it. The transition is uncomfortable because you're giving up certainty about process in exchange for trust in the person. Most leaders who make it through that discomfort find that their team produces better work, not worse, once they're allowed to own it.`,
    },
  ],
  'people-pleasing': [
    {
      q: 'What does people-pleasing look like in a leader?',
      a: `It looks like decisions that never quite happen, feedback that always has a softener attached, and a team that learns to read between the lines because the direct version rarely comes. The people-pleasing leader agrees too easily, avoids the conversation that might create conflict, and finds reasons to delay the hard call. From the outside it can look like thoughtfulness. Over time it looks like indecision. The team starts to compensate, waiting longer for direction, or making calls themselves because they know the leader won't.`,
    },
    {
      q: 'Why is people-pleasing harmful in leadership?',
      a: `Because the team needs something different from the leader than likeability. They need clarity, honesty, and decisions they can rely on. A leader who says yes to avoid conflict isn't protecting the relationship. They're eroding it. People learn quickly when a yes doesn't really mean yes, and when it doesn't, they stop trusting the other signals too. The other cost is accountability. A people-pleasing leader almost always struggles to hold performance standards because holding standards requires being willing to disappoint someone. That's the thing people-pleasers are most trained to avoid.`,
    },
    {
      q: 'How do you stop being a people-pleasing leader?',
      a: `Start with the smallest available version of the hard conversation you've been avoiding. Not the big one. Just the next one in the queue. Say the thing you've been softening or delaying, plainly and kindly, and notice what actually happens. Most people-pleasers are avoiding a catastrophe that almost never materializes. The person receiving honest feedback is usually relieved. The relationship usually gets stronger, not weaker. The fear is almost always larger than the actual risk, and the only way to prove that to yourself is to test it repeatedly until the pattern changes.`,
    },
    {
      q: 'Can you be likable and still be a good leader?',
      a: `Yes. But likability can't be the goal if it comes at the expense of honesty. The leaders people genuinely respect, not just like in the moment, are the ones who tell them the truth, hold a consistent standard, and make decisions without contorting themselves to avoid anyone's disapproval. That kind of leader often is well-liked. But the likability is a byproduct of being trustworthy, not the thing they were optimizing for. The moment likability becomes the goal, you start making decisions that undermine the thing that actually earns trust.`,
    },
  ],
  'reactive-vs-responsive': [
    {
      q: "What's the difference between reacting and responding as a leader?",
      a: `Reacting is what happens when you let the situation drive the behavior. Someone says something that lands wrong and you push back immediately, defend, or escalate. Not because that's the right move. Because that's the reflex. Responding is what happens when you put a beat between the stimulus and the action. Same facts, different outcome. Most leaders know what responsive looks like. The gap is in the moment when the pressure comes. That's where the reactive pattern takes over, and it takes real practice to catch it before it does.`,
    },
    {
      q: 'How do you become a more responsive leader?',
      a: `The first move is noticing when you're about to react. There's almost always a physical signal: tension, a flush of heat, the urge to fire back before the other person finishes their sentence. Learning to recognize that signal and insert a pause is the whole skill. It doesn't require a long pause. Even one breath changes the quality of what comes next. The leaders I've worked with who made this shift all describe the same thing: the situation didn't change, but they stopped being run by it, and that changed everything about how their team experienced them.`,
    },
    {
      q: 'Why do leaders react instead of respond?',
      a: `The brain's stress response is faster than conscious thought. When something feels threatening, and a challenge to your authority, a missed deadline, or a conflict in a meeting can all register as threat, the amygdala fires before the prefrontal cortex has a chance to weigh in. You're not choosing to react. You're being reacted. Most leaders have spent years in environments that rewarded urgency and decisiveness, which means the reactive pattern got reinforced even when it caused damage. Becoming responsive requires building a competing habit, and competing habits take repetition.`,
    },
    {
      q: 'What does reactive leadership look like on a team?',
      a: `People start managing up, monitoring the leader's mood, timing requests carefully, softening messages to avoid the reaction. They stop bringing problems early because early is when problems are still ugly and unformed, and unformed problems tend to get reactive responses. The information the leader receives gets curated, and the leader is usually the last to know this is happening. Reactive leadership creates a team that's focused on managing the leader rather than managing the work, which is an expensive organizational problem dressed up as a personality trait.`,
    },
  ],
  'caretaker-trap': [
    {
      q: 'What is the caretaker trap in leadership?',
      a: `It's when a leader takes on the work, problems, and emotional weight that belong to their team. Someone comes in with a problem and leaves without it, because the leader absorbed it. This looks like helpfulness. Over time it becomes a structural problem: the team stops owning things because the leader keeps picking them up. Nobody intends this. The caretaker trap usually starts with a leader who's genuinely skilled at solving problems and genuinely wants their people to succeed. The trap is that helping in the short term creates dependency in the long run.`,
    },
    {
      q: "Why do leaders take on their team's problems?",
      a: `Several reasons, and they're usually tangled together. Solving feels faster than coaching. Fixing feels like leadership. And for a lot of leaders, being needed is woven into their identity in ways they haven't fully examined. The leader who grew up as the capable one, the person who kept things together, who got things done, who could be counted on, and often becomes the leader who can't stop doing that even when it costs their team something. The pull toward caretaking is real and not malicious. It just needs to be named before it can be changed.`,
    },
    {
      q: "How do you stop solving everyone's problems for them?",
      a: `Ask questions instead of giving answers. When someone comes to you with a problem, your first move is "what have you tried?" and "what do you think the options are?" not "here's what I'd do." This feels slower. It is slower, in the moment. But the second time that person faces a similar problem, they solve it themselves, and the third time, they don't come to you at all. The shift from problem-solver to thinking partner is the single most practical thing a caretaker leader can do, and it starts with one conversation where you resist the instinct to just fix it.`,
    },
    {
      q: "What's the difference between supporting your team and rescuing them?",
      a: `Support builds their capacity. Rescue replaces it. When you support someone, you're giving them what they need to figure it out: a resource, a frame, a question, a connection. When you rescue them, you take the thing they were supposed to figure out off their plate and put it on yours. The distinction matters because rescue feels like support in the moment, to both parties. The way to test which one you're doing: ask whether they walk away more capable than when they came in. If the answer is no, it was probably rescue.`,
    },
  ],
  'expert-trap': [
    {
      q: 'What is the expert trap in leadership?',
      a: `It's when a leader got promoted because they were the best at the work, and then keeps leading by being the best at the work, even though that's no longer the job. The expert trap looks like jumping in with the answer before anyone else gets to try, solving problems faster than the team can learn from them, and being the person everything runs through because everyone has learned that you're faster and more certain. The trap is comfortable because being the expert feels like value. The cost is a team that never develops and a leader who becomes the bottleneck.`,
    },
    {
      q: 'Why do strong individual contributors struggle when they become managers?',
      a: `Because the skills that got them promoted are largely the wrong skills for the new job. Being excellent at the work, knowing the right answer, executing with precision. All of that is rewarded in an individual role and becomes counterproductive in a leadership role. The manager's job is to make the team excellent, which requires a completely different set of instincts: patience, the ability to let someone else be slower and struggle, comfort with outcomes you didn't directly produce. Nobody teaches this explicitly. Most leaders learn it the hard way, years into the role.`,
    },
    {
      q: "How do you lead when you're the smartest person in the room?",
      a: `First, question whether you actually are. That assumption has killed more team cultures than most leaders realize. But even when you have more experience or technical knowledge than anyone on your team, the job isn't to demonstrate it. The job is to make the team smarter over time. That means asking questions you already know the answer to, letting people reach conclusions themselves, and sitting on your instinct to correct until you're sure the correction is necessary. The leaders who create the best teams are rarely the ones whose expertise is most visible. They're the ones who made everyone around them better.`,
    },
    {
      q: 'What does it cost a team when the leader has all the answers?',
      a: `It costs them initiative. When the leader consistently has the answer, the team learns to wait for it rather than develop their own. Problems stop getting surfaced early because people don't want to show up without a solution, and they don't trust that their solution will be good enough anyway. Over time, you get a team of executors instead of a team of thinkers, which means the leader has to be in every decision because the team hasn't been given the practice of making them. The bottleneck isn't a personnel problem. It's a leadership pattern that needs to change.`,
    },
  ],
  'decision-fatigue': [
    {
      q: 'What is decision fatigue and how does it affect leaders?',
      a: `Decision fatigue is what happens when the quality of your decisions deteriorates after you've made too many of them. The brain treats decision-making as a finite resource, and once it's depleted, it starts looking for shortcuts: defaulting to the easiest option, avoiding decisions altogether, or swinging to impulsive choices just to end the drain. For leaders, this is particularly costly because the consequential decisions, the ones that require real judgment, often come late in a day already full of smaller ones. You approve the budget proposal not because it's right, but because saying yes requires less energy than asking the questions.`,
    },
    {
      q: "How do I know if I'm experiencing decision fatigue?",
      a: `The clearest signal is when routine decisions start feeling hard. Choosing between two options that should take thirty seconds takes ten minutes. You find yourself irritable about small things, avoidant of conversations you normally handle without thinking, or agreeing to things you'd normally push back on. Gallup's 2026 survey found that 45% of US managers report feeling consistently exhausted. That's not a personal failing. That's what happens when a decision-heavy role doesn't have the structural support to protect the leader's cognitive resources from depleting before the important calls come.`,
    },
    {
      q: 'What causes decision fatigue at work?',
      a: `Volume, compounded by context-switching. Researchers estimate the average adult makes around 35,000 decisions per day, roughly half of them work-related. For leaders, many of those decisions carry real stakes, which adds cognitive weight beyond the sheer number. The structure of most leadership roles makes it worse: packed calendars with no processing time between back-to-back meetings, a culture where everything escalates up instead of being handled lower, and a default assumption that the senior person should weigh in on everything. The system creates the fatigue. The leader absorbs it personally.`,
    },
    {
      q: 'How do you reduce decision fatigue as a leader?',
      a: `Three structural moves, not willpower. First, protect your best cognitive hours for your most consequential decisions. Don't schedule strategic work after a morning of back-to-back meetings. Second, push decisions down. Every decision that doesn't need you is one less drain on your capacity for the ones that do. Third, create defaults for recurring low-stakes calls: standing policies, pre-agreed criteria, standard responses. So you're not spending judgment on things that don't require it. The goal isn't to decide less. It's to spend your decision-making capacity where it actually matters.`,
    },
  ],
  'burnout-vs-stress': [
    {
      q: "What's the difference between burnout and stress?",
      a: `Stress is too much coming at you. Burnout is running out of what you had. Under stress, you still believe you can get through it. There's a finish line visible, even if distant. Burnout is when the finish line disappears. You stop believing that pushing harder, or even resting, will change anything. The World Health Organization classifies burnout as an occupational phenomenon characterized by three things: exhaustion, growing mental distance from your work, and reduced professional efficacy. You can recover from a stressful week with a good weekend. You can't recover from burnout with a vacation.`,
    },
    {
      q: "How do you know if you're burned out or just stressed?",
      a: `Ask yourself whether rest helps. Stress responds to recovery. A week off, a slow weekend, a good night's sleep makes a real difference. If you come back to the same circumstances and the same depletion is waiting for you exactly where you left it, that's burnout. The other signal is how you feel about your work itself. Under stress, you still care. You want to get through it, get things right, do the job well. Burnout is when the caring goes. Not as a choice, but as a consequence of running on empty long enough that the engine stopped trying.`,
    },
    {
      q: 'Can you recover from burnout just by resting?',
      a: `No. Rest is necessary but not sufficient. Burnout isn't just exhaustion. It's a state where the source of the exhaustion hasn't changed, so returning to it returns you to the depletion. Recovery from burnout requires addressing what created it: unrealistic expectations, chronic lack of agency, environments where effort never feels like enough, or misalignment between the work and what the person actually values. A week on a beach helps temporarily. Without changing the conditions that drove the burnout, you're back in the same place within a few weeks of return, often faster than the first time.`,
    },
    {
      q: 'What does burnout look like in a leader?',
      a: `It looks like a leader who's still showing up but has quietly stopped leading. They're present in meetings but not really there. They approve things they'd normally question. They avoid the conversations that used to feel important. They've stopped caring about outcomes they used to fight for. The irony is that a burned-out leader can be hard to spot because they're still functional. Still making it to the meetings, still producing a version of leadership. But the quality and engagement are gone. The team usually notices before the leader admits it to themselves.`,
    },
  ],
  'prioritization-vs-busyness': [
    {
      q: "What's the difference between being busy and being productive?",
      a: `Busy is full. Productive moves the right things forward. A leader can be completely consumed from 7am to 7pm, meetings back to back, inbox constantly active, always in something, and end the week with nothing that actually mattered accomplished. Productivity means the work you're doing connects to outcomes worth achieving. Busyness is what fills the space when priorities aren't clear enough to protect. Most leaders who feel chronically overwhelmed aren't doing too much work. They're doing work that crowds out the work that matters.`,
    },
    {
      q: 'How do you prioritize when everything feels urgent?',
      a: `Most things that feel urgent aren't. Urgency is a feeling, and it's contagious. The person who sends the message at 9pm makes the recipient feel like it needs a response at 9pm, even if it doesn't. The discipline is separating urgency from importance, and the way to do that is to decide in advance what matters before the day fills up. What are the two or three things that, if they moved this week, would actually change something? Protect time for those first. Then let urgency fill what's left. If you're choosing priorities reactively, under the pressure of what just landed in your inbox, you're not choosing. You're just responding.`,
    },
    {
      q: 'Why do leaders confuse busyness with effectiveness?',
      a: `Because busyness is visible and effectiveness often isn't. A leader who's always in meetings, always responsive, always available looks like someone doing the job. A leader who protects three hours of uninterrupted thinking time every morning looks, from the outside, like they might not be working hard enough. The organizations that reward presence and activity inadvertently train leaders to optimize for looking busy rather than being effective. And most leaders absorb this signal without noticing, because the feedback loop for busyness is immediate and the feedback loop for real impact is slow.`,
    },
    {
      q: 'How do you say no without damaging relationships?',
      a: `You say no to the task, not the person. And you say it early, before someone's already built something around the assumption of your yes. "I can't take that on right now, but here's what I can do" or "that's not something I'm able to prioritize this quarter. Let me help you think about who else might be the right fit" keeps the relationship intact while still holding the boundary. The leaders who damage relationships by saying no are almost always saying it too late, after the other person has already invested in the expectation. The earlier the no, the cleaner it lands.`,
    },
  ],
  'strategic-vs-operational-thinking': [
    {
      q: "What's the difference between strategic and operational thinking?",
      a: `Operational thinking asks how. Strategic thinking asks why and what next. Operational thinking is what runs the business day to day: the processes, the execution, the problem-solving that keeps things moving. Strategic thinking is what determines whether you're moving in the right direction. A leader who only thinks operationally runs an efficient machine pointed at the wrong target. A leader who only thinks strategically has a vision and no way to execute it. Most leaders are naturally better at one than the other, and most leadership roles reward operational competence more visibly than strategic thinking, which creates a slow drift toward the operational end.`,
    },
    {
      q: 'How do you know if you are too operational as a leader?',
      a: `Your calendar is the first test. If most of your time is spent in the work rather than on the work, fixing problems, attending operational meetings, getting into the details of execution, and you can't point to dedicated time for thinking about where the organization is heading, you're probably too operational. The second test is what your team brings to you. If they're bringing you problems to solve rather than decisions to weigh in on, the system has positioned you as the chief problem-fixer rather than the strategic leader. That's a role migration that happens gradually and usually without anyone intending it.`,
    },
    {
      q: 'How do you make time for strategic thinking when you are consumed by operations?',
      a: `Schedule it like a commitment, not a leftover. Strategic thinking that only happens when everything else is done never happens. The practical version is blocking time on the calendar, non-negotiable, protected time that doesn't fill with operational catch-up, and treating it as seriously as a board meeting. What you think about during that time matters less than the habit of creating the space. Many leaders discover that the clarity they were looking for was available all along, they just needed to stop moving long enough to find it.`,
    },
    {
      q: 'Why do so many leaders get promoted and then stay stuck in the weeds?',
      a: `Because the skills that got them promoted are exactly the skills the new role asks them to stop using. The high performer who was promoted because they were great at executing, problem-solving, and knowing the details now sits in a role where the job is to create the conditions for other people to do those things. That's a completely different skill set, and nobody teaches it explicitly. So the promoted leader defaults to what they're good at and trusted in: the work itself. The team learns to bring them problems, the calendar fills with operational meetings, and the strategic role quietly empties out while everyone stays very busy.`,
    },
  ],
  'playing-to-win': [
    {
      q: 'What does it mean to play to win vs. play not to lose in leadership?',
      a: `Playing to win means your decisions are oriented toward possibility and what you're trying to build. Playing not to lose means your decisions are oriented toward avoiding what you're afraid of. Both produce activity. Different quality of activity. The leader playing to win asks "what do we need to do to get there?" The leader playing not to lose asks "what could go wrong if we try this?" One question opens up options. The other closes them down. Brené Brown and Adam Grant have both written about this distinction, and the research backs what most of us already feel: threat mindsets and challenge mindsets produce measurably different performance, even when the circumstances are identical.`,
    },
    {
      q: 'How do you know if you are leading defensively?',
      a: `Look at where the energy in your decisions goes. Are you spending most of your strategic attention on protecting what you have or building toward what you want? Are you most animated by risk mitigation, or by possibility? The clearest signal is often in how the team experiences leadership: a team led defensively tends to be cautious, to seek permission before acting, to avoid surfacing ideas that might not work. That's not a team problem. It's a culture created by a leader who's optimizing for not losing rather than for winning.`,
    },
    {
      q: 'Why do leaders shift into playing not to lose?',
      a: `Usually after they've accumulated something worth protecting. Early in a tenure, most leaders are willing to take risks because they don't have much to lose. After a few years of building something, after developing a reputation and relationships and a track record, the calculus shifts. Now there's something that could be damaged. Fear of failure stops being abstract and becomes concrete. This is the moment where the job of leadership gets harder and the instinct to protect gets stronger, and the leaders who stay in the game at a high level are the ones who recognize the shift and consciously choose to keep playing offense anyway.`,
    },
    {
      q: 'What does playing not to lose cost a team?',
      a: `It costs them their best effort. People don't bring their full creativity and risk-taking to a leader who's signaling that safety matters most. They mirror the posture: cautious, controlled, focused on not making mistakes, and the result is a team doing adequate work in a mediocre culture. The visible cost is missed opportunities. The invisible cost is the caliber of people who start leaving, because the best performers tend to want to build something, and a defensive organization doesn't give them that. Playing not to lose is a strategy that feels safe in the short term and slowly empties the building of the people you most need.`,
    },
  ],
  'imposter-syndrome': [
    {
      q: 'What is imposter syndrome in leadership?',
      a: `Imposter syndrome is the persistent belief that you don't deserve the position you're in and that it's only a matter of time before someone figures that out. It shows up as a nagging sense that your success was mostly luck, that the people around you are more capable than you are, and that you've been running a game on everyone. The term was coined in 1978 by psychologists Pauline Clance and Suzanne Imes. It's more common in leadership than people admit, and it tends to get louder rather than quieter as you move up.`,
    },
    {
      q: 'Do successful leaders really experience imposter syndrome?',
      a: `Routinely. Maya Angelou, who wrote eleven books and was one of the most celebrated writers of the 20th century, said: "I have written 11 books but each time I think, uh-oh, they're going to find out now. I've run a game on everybody, and they're going to find me out." Mike Kail, when promoted to CTO of Yahoo in 2014, wrote that he felt like the dumbest person in the room at every meeting. The Harvard Business Review and RHR International found that 70% of first-time CEOs say feelings of isolation are a significant challenge, and imposter syndrome is woven through that. The experience is nearly universal. What varies is whether people talk about it.`,
    },
    {
      q: 'How do you overcome imposter syndrome as a leader?',
      a: `You don't eliminate it. You learn to lead alongside it. The most useful reframe is recognizing that imposter syndrome is partly a competence signal. It tends to show up in people who have enough self-awareness to know what they don't know. The leaders who never feel it are often the ones who should feel it most. Practically, the move is to separate the feeling from the fact. The feeling says you don't belong. The fact is the track record in front of you. You can acknowledge the feeling without treating it as evidence. And the more you name it out loud with peers you trust, the less power it holds.`,
    },
    {
      q: 'Is imposter syndrome a sign of weakness?',
      a: `The opposite, actually. It's a sign of self-awareness, and it's almost exclusively found in people who care about doing the job well. Leaders who feel like imposters are usually the ones most attuned to the gap between where they are and where they want to be. That gap is what drives growth. The leaders who feel no doubt aren't necessarily more capable. They're often just less honest with themselves about what the job requires. Treating imposter syndrome as weakness is the worst possible response to it, because it makes leaders less likely to admit uncertainty and ask for the help they actually need.`,
    },
  ],
  'loneliness-of-leadership': [
    {
      q: 'Why is leadership so lonely?',
      a: `Because the role structurally limits who you can be honest with. There are things you can't say to your team because it would undermine their confidence. There are things you can't say to your board or investors because of the optics. There are things you can't say to peers in the industry because they're also competitors. And there are things you can't say to friends and family because they don't have the context. The CEO Snapshot Survey found that about 50% of CEOs report feeling lonely, and 61% say it negatively impacts their performance. That's not a personality issue. It's a structural feature of what the role asks you to do.`,
    },
    {
      q: 'How do you deal with loneliness at the top?',
      a: `The first move is naming it, which most leaders won't do because it feels like admitting a weakness. The second move is finding peers who are at a similar level in different organizations, people you can be honest with because they have no stake in your company and you have no stake in theirs. Peer groups, CEO roundtables, and trusted advisors serve this function. A coach can also create the kind of honest space that's hard to find anywhere else at the senior level. The loneliness doesn't go away, but it becomes a lot more manageable when there's at least one relationship where you can say what's actually true.`,
    },
    {
      q: 'Is CEO loneliness real or just a cliché?',
      a: `It's real, and the research backs it up. The Harvard Business Review study found that 50% of CEOs report loneliness. Former US Surgeon General Vivek Murthy noted that loneliness reduces task performance, limits creativity, and impairs reasoning and decision-making, the exact capabilities the role most requires. The cliché version makes it sound like a luxury problem. The actual experience is a persistent sense that there's no one around you who can fully hold the weight of what you're dealing with, because either they work for you, or they don't have enough context, or the stakes for them are different than they are for you.`,
    },
    {
      q: 'How does leadership loneliness affect performance?',
      a: `Directly and measurably. The CEO Snapshot Survey found that 61% of lonely leaders say it negatively impacts their performance. The impact is most visible in decision quality: leaders operating in isolation tend to have smaller information sets, fewer challenges to their assumptions, and less honest feedback about whether their read on a situation is accurate. Over time, the isolation creates a gap between what the leader believes is happening in the organization and what's actually happening. That gap doesn't tend to announce itself. It shows up gradually in decisions that are slightly less calibrated than they should be.`,
    },
  ],
  'four-questions': [
    {
      q: 'How do thoughts affect leadership decisions?',
      a: `More than most leaders realize, and in ways that are hard to catch in real time. Every decision gets filtered through a set of assumptions: about what's true, what's possible, who can be trusted, what the team is capable of, and most of those assumptions were formed long before the current situation. When the assumptions are accurate, the decisions are good. When they aren't, the decisions compound the error. The problem is that assumptions feel like facts from the inside. The leader isn't aware they're making them. They're just deciding, and the decision feels self-evidently right.`,
    },
    {
      q: 'What does it mean to question your assumptions as a leader?',
      a: `It means slowing down long enough to ask: what am I taking as true here that I haven't actually verified? Most leaders are fast thinkers in fast environments, which means the assumption-checking step gets skipped. The practical version is asking one extra question before acting on a strong conviction: what would need to be true for the opposite to be right? If that question is impossible to answer, the assumption probably hasn't been examined. If it's easy to answer, you've found the thing worth checking.`,
    },
    {
      q: 'How do you know when your thinking is getting in your way?',
      a: `When you keep arriving at the same conclusion regardless of the information in front of you. When the feedback you're getting from the team doesn't seem to be landing anywhere in your decision-making. When you find yourself certain about something that a reasonable person in your position should have questions about. These are the signals that the thinking has become the answer rather than a path to the answer. Byron Katie's work on "The Work" asks a simple question of any stressful thought: is it absolutely true? It's a deceptively useful question, because the honest answer is almost never yes.`,
    },
    {
      q: 'Why do smart leaders make bad decisions?',
      a: `Often because their intelligence becomes the problem. Smart leaders build mental models quickly and confidently, which makes them fast, and which also makes them more committed to those models when they're wrong. The faster you can build a convincing case for a position, the less likely you are to question it. Research on cognitive bias shows that intelligence doesn't reduce bias, it just makes people better at rationalizing the bias they already have. The smartest leaders tend to make the best decisions and the worst decisions, depending on whether there's someone around them willing to push back. Without that friction, the intelligence just runs faster in the wrong direction.`,
    },
  ],
  'emotional-regulation': [
    {
      q: 'What is emotional regulation in leadership?',
      a: `It's the ability to experience a strong emotion, frustration, fear, disappointment, anger, without the emotion running the behavior. A regulated leader can feel the full weight of a bad quarter, a team conflict, or a decision that blew up, and still show up in a way that the team can work with. It doesn't mean being emotionally flat or suppressed. It means having enough of a gap between the feeling and the response that the response is chosen rather than automatic. That gap is what leadership presence is actually made of.`,
    },
    {
      q: 'How do you stay calm under pressure as a leader?',
      a: `The practical version is creating physical deceleration in the moment: slowing the breath, pausing before responding, buying the half-second that separates a reactive move from a considered one. The more durable version is doing the work ahead of the moment, understanding your own triggers well enough to see them coming, and building routines that keep the baseline stable when everything is hard. Leaders who are chronically under-rested, over-scheduled, and isolated from people who will tell them the truth have very little buffer left when the pressure comes. Regulation under pressure is mostly built in the hours before the pressure arrives.`,
    },
    {
      q: 'Why do leaders lose their composure and what does it cost?',
      a: `They lose it because the gap between stimulus and response gets closed by fatigue, stress, or situations that hit a particular nerve. What it costs is more than the moment: a leader who loses composure in front of the team teaches the team that the safe move is to manage information carefully before bringing it to them. People stop surfacing problems early. They wait until they're forced to, and by then the problems are larger. One bad reaction doesn't do all of that. But a pattern of reactive behavior, even mild versions, systematically trains the team to protect itself from the truth.`,
    },
    {
      q: 'How do you build emotional regulation as a skill?',
      a: `Like any skill: with practice that happens before you need it. That means developing self-awareness about what specifically destabilizes you, not in the abstract but in the specific: which situations, which people, which types of feedback. It means building physical practices that affect your nervous system baseline: sleep, exercise, and real rest that isn't just scrolling. And it means getting honest feedback from people who will tell you what they see, because most leaders who have a regulation problem are the last to have an accurate picture of it. You can't regulate what you haven't named.`,
    },
  ],
  'hero-vs-host-leadership': [
    {
      q: 'What is the difference between hero leadership and host leadership?',
      a: `The hero leader is the one with all the answers, who steps in to solve problems, who is the source of direction and solutions. The team's job is to execute what the hero decides. The host leader creates the conditions for the team to find answers together. The host sets the stage, brings the right people into the room, asks the questions that focus the thinking, and then gets out of the way. Margaret Wheatley and Deborah Frieze introduced this distinction, and the core insight is that hero leadership, whatever its appeal, rests on the illusion that one person can be in control of complex situations. The host leader has given up that illusion and leads from it.`,
    },
    {
      q: "What's wrong with hero leadership?",
      a: `It creates dependency. When the leader is the one with all the answers, the team learns to bring problems rather than solutions. When the leader takes credit for outcomes, the team learns that their contribution isn't the point. When everything runs through the leader's judgment and approval, the team's judgment never develops. Hero leadership can produce good short-term results while quietly building a team that can't function without the hero in the room. The leader who loved being needed becomes the bottleneck they didn't intend to create.`,
    },
    {
      q: 'How do you lead as a host instead of a hero?',
      a: `Start with questions rather than answers. When someone comes to you with a problem, your first instinct is probably to solve it. The host leader's move is to ask what they've already tried, what they think the options are, and what they'd do if you weren't available. The second move is creating the space for the team to work through things together rather than routing everything through you. That means trusting the process of a good conversation more than you trust your ability to have the right answer. The transition is uncomfortable because it requires giving up something that worked, being the one who figured it out, for something that works better.`,
    },
    {
      q: 'Why does hero leadership create dependency on the team?',
      a: `Because the team learns from what the leader rewards, not from what the leader says. A leader who consistently provides the answer teaches the team that answers come from the leader. A leader who consistently jumps in to save struggling projects teaches the team that struggling projects get rescued. The team isn't passive or incompetent. They're responsive to the system the leader has created. The dependency builds gradually and looks like loyalty or reliance, right up until the leader realizes they can't take a vacation without the team grinding to a halt.`,
    },
  ],
  'the-leader-you-think-you-are': [
    {
      q: 'Why do leaders have blind spots about their own leadership?',
      a: `Because we evaluate ourselves based on what we intended, and other people evaluate us based on what we did. A leader who interrupted someone in a meeting intended to add energy and momentum. The person who got interrupted experienced being dismissed. Both are telling the truth about what happened, and neither fully has the whole picture. The research on self-other agreement in leadership assessments consistently shows significant gaps between how leaders see themselves and how their teams see them. Those gaps aren't evidence of bad character. They're the natural result of being inside an experience rather than observing it from outside.`,
    },
    {
      q: 'How do you find out how your team really sees you as a leader?',
      a: `Ask, and make it safe to tell you. The formal version is a 360-degree assessment, where structured feedback from multiple directions gets aggregated and anonymized. The informal version is asking one person you trust, genuinely trust, the question you've been avoiding: "Is there anything I do that lands differently than I probably intend?" That question takes real courage to ask, and the more senior you are, the more courage it takes, because the stakes for the person answering feel high. Creating the conditions where they can be honest with you is more important than the question itself.`,
    },
    {
      q: "What's the gap between how leaders see themselves and how their teams see them?",
      a: `Consistently wider than leaders expect, especially on qualities that feel most central to their identity. Research on the Leadership Circle Profile, which measures self versus rater scores, finds that leaders regularly overestimate how well the team can speak up, how safe it feels to disagree, and how much the leader's behavior matches their stated values. The gap isn't random. It tends to show up most in areas where feedback is hardest to receive, which means the leader's blind spots cluster around exactly the things they most need to hear.`,
    },
    {
      q: 'How do you become a more self-aware leader?',
      a: `Get data from outside your own head. Self-reflection is valuable, but self-reflection without external input is just the same story told more carefully. Formal assessment tools give you structure. Coaching gives you a thinking partner who has no stake in protecting your self-image. But the fastest route is asking three or four people who work closely with you a specific question: "What's one thing I do consistently that makes your job harder?" Then listen without defending. Whatever comes back, even if it surprises you, is data worth having. The leaders with the highest self-awareness almost always have someone in their life who will tell them the truth, and they've actively created that relationship.`,
    },
  ],
  'what-got-you-here': [
    {
      q: 'What does "what got you here won\'t get you there" mean?',
      a: `It means that the skills, habits, and behaviors that produced your success at one level of leadership are often exactly the things that limit you at the next. You were promoted because you were decisive, always had an answer, pushed hard for the win, and knew the work better than anyone. Those are genuine strengths. The problem is that at a senior level, the same behaviors, needing to win every argument, adding your input to every idea, solving problems faster than your team can learn from them, start costing you more than they earn. Marshall Goldsmith, who coined the phrase, spent decades coaching some of the most successful executives in the world on this exact problem.`,
    },
    {
      q: 'What behaviors hold successful leaders back from the next level?',
      a: `Goldsmith identified twenty habits that show up repeatedly in high-achieving leaders who plateau. A few of the most common: needing to win too much, so you fight for your position even when it doesn't matter; adding too much value, where you take someone's good idea and "improve" it until it's yours and they've lost ownership of it; and an excessive need to be "me," using your personality or your history of success as a reason not to change. The thread connecting all of them is that they feel like strengths. They are strengths at a lower level. At a senior level, the same behaviors signal that you're optimizing for being right rather than for making the team right.`,
    },
    {
      q: 'Why do the habits that made you successful become a problem at the senior level?',
      a: `Because the job changes faster than the person does. As an individual contributor, your impact came directly from your own output and judgment. As a senior leader, your impact comes through other people, through what you create the conditions for, not what you do yourself. The leader who has to win every debate undermines the team's ownership. The leader who always has the answer trains the team to stop thinking. The leader who needs to be recognized for their contribution slowly erodes the people around them. None of this is intentional. It's the old skill set running on autopilot in a role that requires something different.`,
    },
    {
      q: 'How do you identify which behaviors are holding you back?',
      a: `Ask the people who work with you, not the ones who work for you. Your direct reports have learned to manage around your patterns. They've already adapted. The people who will give you the most useful signal are peers and colleagues who interact with you regularly and have no stake in softening the answer. Goldsmith's method was feedforward: instead of asking for feedback on what you've done wrong, ask for two suggestions about what you could do differently going forward. It's a small linguistic shift that makes the conversation much easier to have. The other route is a 360 assessment, where the aggregated, anonymous picture of how you're landing is usually both surprising and clarifying.`,
    },
  ],
  'accountability-gap': [
    {
      q: 'What is the accountability gap in leadership?',
      a: `It's the distance between what a leader says they expect and what they actually hold people to. The gap shows up when a leader communicates a standard, accepts behavior that falls short of it, and then communicates the standard again. After a few cycles of this, the team learns that the standard isn't real. It's aspirational. The accountability gap is almost never intentional. It opens because holding people to a standard requires a difficult conversation, and most leaders find it easier to give another chance than to have that conversation. The cost is that the team learns what's actually expected by watching what's actually tolerated.`,
    },
    {
      q: 'Why do leaders struggle to hold people accountable?',
      a: `Mostly because accountability conversations are uncomfortable and the consequences of having them feel more immediate than the consequences of avoiding them. If I let this slide, nothing bad happens today. If I push back, I risk damaging the relationship, creating conflict, or having to follow through on something I'd rather not. Most leaders choose the path of least resistance in the moment, and over time those accumulated choices become a culture of low accountability that nobody explicitly chose. The other version is the leader who holds everyone accountable for everything at once, which swings too far the other direction and creates anxiety rather than ownership.`,
    },
    {
      q: 'How do you close the accountability gap on your team?',
      a: `Make the expectation explicit, make the consequence real, and then follow through the first time it matters. Accountability gaps usually open because one of those three things is missing. The expectation exists only in the leader's head, or the consequence was never named, or the first time the standard was violated, nothing happened. Closing the gap means being specific about what you expect, specific about what happens if it doesn't happen, and then actually doing the thing you said you'd do. The team is watching to see if the standard is real. They find out on the first test.`,
    },
    {
      q: 'What happens to a team when accountability is missing?',
      a: `The people who take their commitments seriously start to feel like they're working twice as hard for the same outcome as the people who don't. The best performers, who always have options, start calculating whether it's worth staying. The people who've figured out that low performance has no real consequence start optimizing around that. And the leader spends more and more time managing the same problems that should have been resolved months ago. Low accountability isn't just about individual performance. It changes the quality of the team and eventually changes who stays in it.`,
    },
  ],
};

// ─── DATE FORMATTING ───────────────────────────────────────────────────────

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[month - 1]} ${day}, ${year}`;
}

// ─── HTML GENERATORS ───────────────────────────────────────────────────────

function makeFaqPageSchema(slug, faqs) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
  return `  <script type="application/ld+json">
${JSON.stringify(schema, null, 2).replace(/</g, '\\u003c')}
  </script>`;
}

function makeFaqHtml(faqs) {
  const items = faqs
    .map(
      ({ q, a }) => `    <details class="sm-faq-item">
      <summary>${q}</summary>
      <div class="sm-faq-answer"><p>${a}</p></div>
    </details>`
    )
    .join('\n');

  return `\n<section class="sm-faq-section">
  <div class="sm-faq-inner">
    <h2>Common Questions</h2>
${items}
  </div>
</section>\n`;
}

const FAQ_STYLES = `  <style>
    /* AEO Common Questions section */
    .sm-faq-section { background: #fff; padding: 48px 24px 16px; }
    .sm-faq-inner { max-width: 820px; margin: 0 auto; }
    .sm-faq-inner h2 { font-family: 'Libre Baskerville', Georgia, serif; font-size: 1.45rem; color: #123E35; margin: 0 0 24px; }
    .sm-faq-item { border-bottom: 1px solid #e2ddd2; padding: 0; }
    .sm-faq-item summary { font-family: 'Inter', Arial, sans-serif; font-weight: 600; font-size: 1.0rem; color: #123E35; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px 0; }
    .sm-faq-item summary::-webkit-details-marker { display: none; }
    .sm-faq-item summary::after { content: '+'; color: #C4973B; font-size: 1.4rem; font-weight: 400; line-height: 1; flex-shrink: 0; }
    .sm-faq-item[open] summary::after { content: '\\2013'; }
    .sm-faq-answer { padding: 0 0 18px; line-height: 1.75; color: #2a322e; font-size: 0.98rem; }
    .sm-faq-answer p { margin: 0 0 0.8em; }
    .sm-faq-answer p:last-child { margin-bottom: 0; }
    @media print { .sm-faq-section { display: none; } }
  </style>`;

// ─── MAIN ──────────────────────────────────────────────────────────────────

let updated = 0;
let skipped = 0;

for (const [slug, { date, title }] of Object.entries(ARTICLES)) {
  const filePath = join(ROOT, `${slug}.html`);
  let html;
  try {
    html = readFileSync(filePath, 'utf8');
  } catch {
    console.warn(`  SKIP (not found): ${slug}.html`);
    skipped++;
    continue;
  }

  if (html.includes('<!-- aeo-updated -->')) {
    console.log(`  SKIP (already done): ${slug}.html`);
    skipped++;
    continue;
  }

  const faqs = FAQS[slug] || null;

  // 1. Add datePublished + dateModified to existing Article schema
  html = html.replace(
    /("@type"\s*:\s*"Article"[\s\S]*?)(\n\s*"url"\s*:)/,
    (match, before, urlLine) => {
      if (before.includes('datePublished')) return match; // already has it
      return `${before},\n  "datePublished": "${date}",\n  "dateModified": "${date}"${urlLine}`;
    }
  );

  // 2. Add FAQPage schema block (before </head>)
  if (faqs) {
    const faqSchema = makeFaqPageSchema(slug, faqs);
    if (!html.includes('"FAQPage"')) {
      html = html.replace('</head>', `${faqSchema}\n</head>`);
    }
  }

  // 3. Add FAQ styles (before </head>) — use a distinct sentinel to avoid false positives
  if (faqs && !html.includes('<!-- aeo-faq-styles -->')) {
    html = html.replace('</head>', `<!-- aeo-faq-styles -->\n${FAQ_STYLES}\n</head>`);
  }

  // 4. Add visible date after .header-category div
  const dateLine = `            <div class="header-date">Published <time datetime="${date}">${formatDate(date)}</time></div>`;
  if (!html.includes('header-date')) {
    html = html.replace(
      /(<div class="header-category">[^<]*<\/div>)/,
      `$1\n${dateLine}`
    );
  }

  // 5. Add date style (before </head>)
  if (!html.includes('.header-date')) {
    html = html.replace(
      '</head>',
      `  <style>.header-date { font-size: 0.72rem; letter-spacing: 0.04em; color: rgba(255,255,255,0.42); margin-top: 4px; }</style>\n</head>`
    );
  }

  // 6. Add Common Questions HTML (before <div class="action-bar">)
  if (faqs && !html.includes('<!-- aeo-faq-html -->')) {
    const faqHtml = makeFaqHtml(faqs);
    html = html.replace('<div class="action-bar">', `<!-- aeo-faq-html -->\n${faqHtml}<div class="action-bar">`);
  }

  // 7. Mark as updated
  html = html.replace('<head>', '<head>\n<!-- aeo-updated -->');

  writeFileSync(filePath, html, 'utf8');
  console.log(`  ✓ ${slug}.html`);
  updated++;
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped.`);

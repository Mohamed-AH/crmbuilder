# The cement factory that ran on two numbers

> **Written 8 September 2026. A point-in-time piece, not maintained.**
> Once a post is published it cannot be edited, so this is dated rather than
> kept current. For what the digest does *today*, see
> [USER-GUIDE.md](../USER-GUIDE.md) or the [manual](../manual.html).

Earlier in my career, I worked for a smart businessman who ran a cement factory
with four production lines and two sales teams. Every morning, I compiled a
simple report with just two metrics: **production downtime in hours** and
**sales in tonnes**.

If downtime was high, he confronted the production team. If downtime was low
but sales were down, he confronted the sales team. Each department had full
reports, but this standalone digest gave him an instant snapshot to catch drift
from anywhere.

That exact concept inspired the new digest feature in my CRM app.

---

## Why two numbers beat a dashboard

It took me a while to work out what made that sheet of paper effective, because
on the face of it it was the least sophisticated thing in the building. The
production team had detailed reports. The sales team had detailed reports. Mine
had two numbers on it.

Three things, and they are all about what it deliberately left out.

**It did not tell him what was wrong. It told him where to go and look.** The
report was never the analysis — it was the thing that decided which of two
conversations he was going to have that morning. The detail lived where it
belonged, with the people who owned it.

**It came to him.** Nobody had to remember to open anything. That matters more
than it sounds: the days you most need to notice drift are the days you are
busiest with something else.

**It was the same two numbers every day**, which is what made a change
meaningful. A metric that moves around because the report changed shape is not
a signal.

## What that turns into, in a CRM

A small business does not have production downtime. It has the same problem
wearing different clothes: **things quietly falling past their date.** An
invoice that went out six weeks ago. A quote nobody chased. A task that was
urgent on Tuesday.

All of it is already in the CRM. The trouble is that noticing requires you to
go and look, and the mornings you skip looking are exactly the mornings it
matters.

So: **once a day, your workspace posts a count of what is due or overdue to
your team's chat channel.** Here is a real one, from a test workspace I set up
while writing this:

```
Ridgeline Signage — 7 items need attention
• Invoices: 2 overdue, 3 due within 7 days
• Tasks: 1 overdue, 1 due within 7 days
```

That is the whole message. It is the cement factory sheet: it does not tell you
which invoice, it tells you to go and open Invoices.

---

## Setting it up

About three minutes. Settings → **Notifications**, and you have to be the
workspace owner.

**1. Point it at a channel.** For Slack or Discord, create an incoming webhook
in your chat app and paste the URL in. For Telegram there is no URL to paste —
it gives you a bot token instead, and the chat ID is normally buried in a raw
API response. So paste the token, press **Find my chat**, and pick from the
list it comes back with.

> One thing worth deciding rather than discovering: **the action you take is
> the destination.** If you press Start in a private chat with the bot, the
> digest arrives as a private message to you. If you add the bot to a group, it
> goes to the whole group. Pick the one you actually meant.

**2. Press Send a test message.** It goes out immediately, so you find out now
rather than at 8am tomorrow. If something is wrong it says what — a bad token
reads differently from a channel the bot was never added to.

**3. Set your time zone.** It decides which calendar day a reminder belongs to.
Left unset, everything is treated as UTC, which is fine until it is not.

**4. Choose the look-ahead window.** 7 days by default. This is "how far into
the future counts as due" — anything already overdue is always included however
old, so the window only bounds the future side.

**5. Choose the earliest hour.** Mine is 08:00. It is the earliest the digest
may go out rather than an exact time, because the pass runs on a schedule
rather than on a clock you own.

**6. Read the preview, then switch it on.** The screen shows the exact message
your team would get, right now, with your real numbers in it — not a mock-up.
That is the part I would not ship without: you should see what everyone else is
going to see before anyone else sees it.

---

## What it deliberately does not do

Each of these was a decision, and each one is the sort of thing that would
annoy you within a fortnight if it went the other way.

**It never names a record.** *"Invoices: 2 overdue"*, never *"Invoice INV-1014,
Fernhill Nursery, £2,400"*. A chat channel usually has more people in it than
your CRM does — clients get invited to shared channels, contractors stay in
them long after a project ends — and you will not be thinking about that while
pasting a webhook URL. The message's job is to get somebody to open the CRM.
Easy to add names later; impossible to un-send them.

**A quiet day sends nothing.** There is no daily "all clear". A message that
arrives every morning whether or not anything is wrong is one you stop reading
inside a week, and then it is worse than nothing, because you believe you are
being told.

**It goes once a day, not live.** Something that becomes due at lunchtime is in
tomorrow's. Live means re-checking every workspace every few minutes, which is
a different feature with a different price, and the cement factory report was
daily for the same reason: you want the state of things at a moment you can
compare against yesterday.

**It is off until you turn it on.** Nobody's team channel should start
receiving messages because a new version shipped.

---

## The part I did not expect

Building this, the hardest question was not how to send the message. It was
**how to know it is still running.**

A daily thing that silently stops is worse than one that never existed, because
you carry on believing you would have been told. And you cannot solve that from
inside: an app that has stopped working cannot notice that it has stopped
working.

So the digest sends a heartbeat to an external monitor every time it runs —
counts only, no data — and if that heartbeat stops arriving, the monitor tells
me. Not the app. Somebody else's machine, whose job is to notice silence.

The cement factory had the same property and I never thought about it at the
time: the report landed on his desk every morning, so **the day it did not
arrive was itself the signal.** I was the monitor.

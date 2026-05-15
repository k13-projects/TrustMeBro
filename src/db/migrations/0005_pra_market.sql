-- nontransactional
-- Add 'pra' (Points + Rebounds + Assists) to the prop_market enum.
-- PRA is one of PrizePicks' core markets; the user explicitly wants
-- predictions for it. The combined stat is computed in code from
-- points + rebounds + assists per game.
alter type prop_market add value if not exists 'pra';

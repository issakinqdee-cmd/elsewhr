# ELSEWHR

ELSEWHR is a social discovery platform concept built around random 1-on-1 chat, discovery, connections, calls, rooms, and a future Genesis private-space layer.

## Current prototype

- Landing page
- Random 1-on-1 chat interface
- Discover profile cards
- Create Profile modal with required primary photo concept
- ELSEWHR+ pricing and feature modal
- Voice/video call UI placeholders
- Translation is planned as a free core feature
- Genesis placeholder
- Responsive desktop/mobile styling

## Planned production stack

- React + Vite frontend
- Supabase Auth + Postgres + Realtime + Storage
- Vercel deployment
- PayPal for ELSEWHR+ subscriptions and future one-time purchases
- Moderation and abuse-prevention layer

## ELSEWHR+

Target launch price: $1.99/month or $19.99/year.

Production features should not trust the frontend for entitlements. Subscription status should be verified server-side and reflected in the user's profile state.

## Safety direction

Primary profile photos are required for public/discoverable profiles. Media moderation, block, report, spam controls, and privacy controls remain core platform features.

## Run locally

npm install
npm run dev

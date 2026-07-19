import type { TourClip } from './types'

// The Global Meltdown archive. In production, gen-atlascloud-videos.mjs writes real
// mp4Url/webmUrl + status='ready' here (all sharing the locked super-fan seed 480917).
// For the vertical slice these ship with mixed statuses so the async UI (posters,
// "RENDERING RAVE…" loaders, error retry) is exercised without spending on renders.
export const TOUR_CLIPS: TourClip[] = [
  {
    id: 'ibiza',
    city: 'IBIZA',
    venue: 'Terraza del Vapor',
    year: '2004',
    seed: 480917,
    status: 'ready', // pretend this one finished rendering
    posterUrl: '/assets/tour/ibiza.jpg',
    mp4Url: '', // wired by the generator; empty -> component shows animated poster loop
    webmUrl: '',
    blurb: 'Foam cannons. Sunrise. Bianca loses a platform boot and gains a legend.',
  },
  {
    id: 'tokyo',
    city: 'TOKYO',
    venue: 'Sub-Basement 9',
    year: '2004',
    seed: 480917,
    status: 'rendering', // exercises the "RENDERING RAVE…" loader
    posterUrl: '/assets/tour/tokyo.jpg',
    blurb: 'Neon micro-club, rain on the windows, ceiling you can touch. Suki ascends.',
  },
  {
    id: 'miami',
    city: 'MIAMI',
    venue: 'Rooftop Condensa',
    year: '2004',
    seed: 480917,
    status: 'queued', // exercises the queued state
    posterUrl: '/assets/tour/miami.jpg',
    blurb: 'Pool deck at 3am. Ocean humidity. Mel blows the whistle for 11 straight minutes.',
  },
  {
    id: 'berlin',
    city: 'BERLIN',
    venue: 'The Original Sauna',
    year: '2004',
    seed: 480917,
    status: 'error', // exercises the retry affordance
    posterUrl: '/assets/tour/berlin.jpg',
    blurb: 'A pilgrimage to where it all short-circuited. Render failed: too much steam.',
  },
]

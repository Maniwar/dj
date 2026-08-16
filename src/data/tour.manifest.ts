import type { TourClip } from './types'

// The Global Meltdown archive (all four sharing the locked super-fan seed 480917).
//
// These once carried DELIBERATELY MIXED statuses — rendering / queued / error — so the async UI
// could be exercised before any render had been paid for. All four cities have since been
// rendered and are on disk, so the placeholder states are not just stale, they were being
// contradicted on screen: Berlin's blurb announced "Render failed: too much steam" underneath a
// video that plays perfectly well. Statuses now describe reality.
//
// The clip a stop actually plays comes from atlascloud.results.json via hydrateRealVideo(), which
// takes priority over mp4Url here — so this file is documentation of what exists, and it should
// not be allowed to drift away from what does.
export const TOUR_CLIPS: TourClip[] = [
  {
    id: 'ibiza',
    city: 'IBIZA',
    venue: 'Terraza del Vapor',
    year: '2004',
    seed: 480917,
    status: 'ready',
    posterUrl: '/assets/tour/ibiza.jpg',
    mp4Url: '', // wired by the generator; empty -> hydrateRealVideo() supplies the clip
    webmUrl: '',
    blurb: 'Foam cannons. Sunrise. Tanja loses a platform boot and gains a legend.',
  },
  {
    id: 'tokyo',
    city: 'TOKYO',
    venue: 'Sub-Basement 9',
    year: '2004',
    seed: 480917,
    status: 'ready',
    posterUrl: '/assets/tour/tokyo.jpg',
    blurb: 'Neon micro-club, rain on the windows, ceiling you can touch. Mitzi ascends.',
  },
  {
    id: 'miami',
    city: 'MIAMI',
    venue: 'Rooftop Condensa',
    year: '2004',
    seed: 480917,
    status: 'ready',
    posterUrl: '/assets/tour/miami.jpg',
    blurb: 'Pool deck at 3am. Ocean humidity. Brigitte blows the whistle for the entire last hour.',
  },
  {
    id: 'berlin',
    city: 'BERLIN',
    venue: 'The Original Sauna',
    year: '2004',
    seed: 480917,
    status: 'ready',
    posterUrl: '/assets/tour/berlin.jpg',
    blurb: 'A pilgrimage to where it all short-circuited. The sauna is still there. It still scores a 2.',
  },
]

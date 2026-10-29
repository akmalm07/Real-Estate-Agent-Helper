# Phase 1 image provenance

## Shipped architectural editorial photograph

- Local file: `frontend/public/images/campus-north-mx-granger.webp`.
- Title: Campus North Residential Commons, University of Chicago.
- Author: **Mx. Granger**, own work, photographed June 25, 2019.
- Primary source: https://commons.wikimedia.org/wiki/File:Campus_North_Residential_Commons.jpg
- Repository metadata: https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&titles=File%3ACampus_North_Residential_Commons.jpg
  Page ID `80036013`; author Mx. Granger; LicenseShortName `CC0`;
  UsageTerms `Creative Commons Zero, Public Domain Dedication`; attribution
  required `false`; restrictions empty.
- License deed: https://creativecommons.org/publicdomain/zero/1.0/
  CC0 1.0 Universal Public Domain Dedication. Copyright reuse/modification is
  permitted without payment; this is not a warranty of unrelated rights.
  No affiliation or endorsement is asserted. Attribution is courteous.
- Original: https://upload.wikimedia.org/wikipedia/commons/1/12/Campus_North_Residential_Commons.jpg
- Retrieved October 29, 2026 UTC by the manager; file page, API, deed and original
  each returned HTTP200. Supervisor independently read the saved API metadata,
  opened the live primary file page and deed, and inspected original/derivative
  pixels. Saved primary HTML/API/deed are in manager scratch, with handles in
  `reah-provenance-resolution.md`; not shipped runtime dependencies.
- Original: 4160 × 3120 JPEG, 5994665 bytes, SHA256
  `581b192bb848df1538a274292659a158d9517b76946f7118508d496becc31c49`.
- Derivative: resized to **1400 × 1050 WebP**; SHA256
  `4c8bb7265174793b427cc5181e9a078110e33172117feda80c67ad984478d5fe`.
  See VISUAL-VERIFICATION.md for measured size. No original 6MB JPEG shipped.
  CSS cover crop uses 5:6 desktop / 6:5 mobile frames and 50% 48% positioning.
- Alt describes white campus buildings, leafy courtyard and sky. Visible caption
  identifies the actual architecture and author, CC0, editorial use, not a listing,
  and no affiliation/endorsement. Never attached to real property records.
- Local delivery only, eager/high-priority LCP, explicit intrinsic dimensions,
  reserved frame and useful text fallback retaining the caption.

## Rejected asset history — not shipped

The previous candidate was attributed to Paul Lichtblau / Unsplash:
`https://unsplash.com/photos/white-and-gray-concrete-building-under-blue-sky-during-daytime-fdRvHnzhBZY`;
intended license `https://unsplash.com/license`; download
`https://images.unsplash.com/photo-1564516102027-e1b05c383a87?auto=format&fit=crop&fm=webp&q=78&w=1400`.
Its 1400 × 2100 WebP was 226166 bytes with SHA256
`bb1fb14d4f74bb090a659245f30f2f5be1ea1d6e8d835386ed71dcf2da840f4b`.
The prior worker claimed verification, but preserved evidence did not establish
that exact mapping: direct photo/license requests returned401 and browser Access
Denied. It is rejected, excluded from public delivery and the commit, and retained
only in untracked audit storage. General license wording did not authenticate it.
D008 records the manager's free-image recovery default, not a user image choice.

Existing `hero.png` was inspected and rejected as an unsuitable purple abstract
illustration. It remains unused. No paid asset, new service, photo data field,
customer-listing image or remote font was added.

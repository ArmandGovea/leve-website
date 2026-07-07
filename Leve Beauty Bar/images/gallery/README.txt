HOW TO ADD YOUR GALLERY PHOTOS
================================

1. Drop your photo files into this folder (images/gallery/).

2. Name them to match the list in index.js, near the top of the
   DOMContentLoaded handler, under the comment "GALLERY — auto-scrolling
   photo strip":

      const GALLERY_IMAGES = [
        'images/gallery/gallery-1.jpg',
        'images/gallery/gallery-2.jpg',
        'images/gallery/gallery-3.jpg',
        'images/gallery/gallery-4.jpg',
        'images/gallery/gallery-5.jpg',
        'images/gallery/gallery-6.jpg',
      ];

   - You can rename the files however you like, as long as the
     filenames in this array match exactly (including the
     "images/gallery/" path in front).
   - Add or remove lines from the array to add or remove photos —
     the gallery automatically adjusts and keeps scrolling smoothly.
   - Use reasonably sized images (under ~500KB each, roughly portrait
     orientation works best) so the page loads quickly.

3. Save index.js and refresh the page — your photos will scroll
   across the new Gallery section automatically, pausing on hover.

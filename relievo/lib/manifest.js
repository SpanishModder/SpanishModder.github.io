(function () {
  "use strict";
  window.__BRAND__ = {
    name: "Relievo",
    tagline: "Generate real height maps of anywhere in the world",
    subtitle: "Search for a place, draw an area on the map, and download the height map as a PNG. Everything is calculated instantly in your browser.",

    faqs: [
      {
        q: "Where does the elevation data come from?",
        a: "From an open dataset (SRTM, 3DEP, and GMTED, combined and served as tiles by AWS Open Data) covering the entire planet. Actual resolution varies by location: it is very high in the U.S. and much of Europe, and lower in remote areas."
      },
      {
        q: "How large can the area I select be?",
        a: "As large as you like, but the larger the area, the less detail the result will have: Relievo distributes a limited number of data tiles across the selected area so that the preview remains instant. For maximum detail, select areas the size of a city or valley rather than an entire country."
      },
      {
        q: "Is the PNG I download compatible with Unity, Unreal, or World Machine?",
        a: "Yes. It is an 8-bit grayscale PNG: black represents the lowest point in the selected range and white the highest. It is the standard format accepted by most game engines and terrain generators."
      },
      {
        q: "Can I set the elevation range manually?",
        a: "Yes. By default, Relievo maps black and white to the actual minimum and maximum elevations of your selection, but you can set a custom range manually — useful if you are exporting multiple areas and need them to share the same scale."
      },
      {
        q: "Is my data or selection stored on any server?",
        a: "No. Relievo does not have its own server: your browser requests map and elevation tiles directly from the open data providers, and all height map processing takes place on your device."
      },
      {
        q: "Why does the height map look blurry or have visible steps?",
        a: "This usually happens in areas with low-resolution source data (remote mountains, polar regions) or when you select an area that is too large for the available level of detail. Try zooming in on the map and selecting a smaller area."
      },
      {
        q: "Do I need to install anything or create an account?",
        a: "No. Relievo runs entirely in your browser, with no registration, no installation, and no cost."
      }
    ]
  };
})();
/* Fallbacks for the shared design (/design/, loaded just before this).
   - When the master's tokens and components aren't there, or are a version from before the
     shared scales and sd- components, link this site's copy of them (assets/design/, copied
     from areeb-ece.github.io/public/design/). A stylesheet earlier in <head> has already
     applied by the time this runs, so checking one of its scales is enough.
   - Offline, with no /design/theme.js at all, restore the saved light/dark sheet. */
(function () {
  var root = document.documentElement;
  if (!getComputedStyle(root).getPropertyValue("--sp-4").trim()) {
    ["tokens.css", "ui.css"].forEach(function (f) {
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "assets/design/" + f;
      document.head.appendChild(l);
    });
  }
  if (!window.SiteDesign) {
    try { var t = localStorage.getItem("satisfactorytools.theme"); if (t === "light" || t === "dark") root.dataset.theme = t; } catch (e) {}
  }
})();

/* VTEX Wallet — Router History API.
 *
 * Enveloppe `window.showView(name)` avec :
 *  - une URL réelle par écran (24 vues) synchronisée via `history.pushState`
 *  - un handler `popstate` pour les boutons précédent / suivant du navigateur
 *  - une résolution deep-link au chargement (ex. /cartes ouvre directement la vue)
 *  - un rafraîchissement stable (l'état `history.state` est réhydraté au boot)
 *
 * Ne modifie AUCUNE logique de `showView` : le wrapper appelle simplement
 * l'implémentation précédente puis met à jour l'URL. Doit être chargé APRÈS
 * `vtex-api.js` et tout autre script qui ré-enveloppe `showView`, pour
 * intercepter la chaîne finale.
 */
(function () {
  "use strict";

  var VIEWS = [
    "login", "otp", "accueil", "recu", "cartes", "profil", "confidentialite",
    "support", "email-compose", "banque", "recevoir", "historique",
    "notifications", "envoyer", "beneficiaires", "beneficiaire-detail",
    "beneficiaire-form", "partage-fonds", "virement-choix", "virement-instantane",
    "virement-classique", "transfert-cartes", "confirmation", "recharger",
  ];

  function viewToPath(name) {
    return name === "accueil" ? "/" : "/" + name;
  }

  function pathToView(rawPath) {
    var trimmed = String(rawPath || "").replace(/^\/+|\/+$/g, "");
    if (!trimmed || trimmed === "index.html") return "accueil";
    return VIEWS.indexOf(trimmed) >= 0 ? trimmed : null;
  }

  /* La vue déduite de l'URL au tout premier chargement. Utilisée pour rediriger
     l'utilisateur vers son écran après que l'application a fini son propre
     amorçage (login/hydrate → accueil). */
  var initialView = pathToView(window.location.pathname);
  var deepLinkTarget = null;
  if (initialView && initialView !== "accueil" && initialView !== "login" && initialView !== "otp") {
    deepLinkTarget = initialView;
  }

  /* Passe à `true` uniquement pendant qu'on rejoue une transition demandée par
     `popstate` : dans ce cas on ne veut pas re-`pushState` la même vue. */
  var suppressUrlUpdate = false;

  function updateUrl(name, replace) {
    var path = viewToPath(name);
    if (window.location.pathname === path) {
      /* Le pathname est déjà bon : on ne fait que "tamponner" l'état d'historique pour un
         futur popstate, sans réécrire l'URL visible — sinon une query string existante
         (ex. ?preview=support pour la prévisualisation démo) serait effacée silencieusement. */
      if (replace && (!history.state || history.state.view !== name)) {
        try { history.replaceState({ view: name }, "", window.location.pathname + window.location.search + window.location.hash); } catch (_) { /* noop */ }
      }
      return;
    }
    try {
      if (replace) history.replaceState({ view: name }, "", path);
      else history.pushState({ view: name }, "", path);
    } catch (_) { /* Environnements exotiques : la nav sans URL reste fonctionnelle. */ }
  }

  function install() {
    if (typeof window.showView !== "function") return false;

    /* Stamp l'entrée d'historique courante avec un state exploitable au reload. */
    if (!history.state || typeof history.state.view !== "string") {
      updateUrl(initialView || "accueil", true);
    }

    var previousShowView = window.showView;
    window.showView = function (name) {
      var result = previousShowView.apply(this, arguments);
      if (!suppressUrlUpdate) {
        if (deepLinkTarget) {
          if (name === deepLinkTarget) {
            /* Arrivée à destination : on ne pousse rien (l'URL est déjà bonne)
               mais on aligne le state pour un futur `popstate`. */
            updateUrl(name, true);
            deepLinkTarget = null;
          } else if (name === "accueil") {
            /* Fin de l'amorçage : l'appli affiche l'accueil, on relance vers la
               cible. Reprogrammé au tick suivant pour laisser la vue accueil
               finir son rendu et éviter une récursion synchrone. */
            var target = deepLinkTarget;
            requestAnimationFrame(function () { window.showView(target); });
          }
          /* Vues intermédiaires (login, otp) pendant un deep-link : on
             n'écrase pas encore l'URL — elle sera rétablie à l'arrivée. */
        } else {
          updateUrl(name);
        }
      }
      return result;
    };

    window.addEventListener("popstate", function (event) {
      var view = (event.state && event.state.view) || pathToView(window.location.pathname);
      if (!view || VIEWS.indexOf(view) < 0) return;
      suppressUrlUpdate = true;
      try { window.showView(view); } finally { suppressUrlUpdate = false; }
    });

    return true;
  }

  if (!install()) {
    document.addEventListener("DOMContentLoaded", function () { install(); });
  }
})();

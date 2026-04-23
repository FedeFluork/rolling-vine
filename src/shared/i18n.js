(function () {
  const DEFAULT_LOCALE = "en";
  const HOST_LOCALE_MAP = {
    "www.amazon.it": "it",
    "www.amazon.es": "es",
    "www.amazon.de": "de",
    "www.amazon.fr": "fr",
    "www.amazon.co.uk": "en",
    "www.amazon.com": "en"
  };

  const UI_STRINGS = {
    en: {
      syncButton: "Sync Vine history",
      syncIconAlt: "Sync icon",
      lastSyncLabel: "Last sync:",
      never: "Never",
      startingSync: "Starting sync...",
      syncingOrders: "Syncing orders...",
      syncingReviews: "Syncing completed reviews...",
      supportExtension: "Support this extension:",
      donateWithKofi: "Donate with Ko-fi",
      donateWithPaypal: "Donate with PayPal",
      syncStartFailedPrefix: "Sync failed to start",
      labels: {
        orders: "Orders",
        reviews: "Reviews",
        rate: "Review rate"
      },
      riskByPeriod: {
        90: "High risk of Vine Jail",
        60: "Moderate risk",
        30: "Low risk"
      },
      neutralRiskLabel: "Percentage in safe zone",
      periodTitle: (days) => `Last ${days} days`,
      rateNA: "N/A",
      safeStoppedCaptcha: "Sync stopped: Amazon requested a CAPTCHA. Open the Vine page, complete the CAPTCHA challenge, then retry sync.",
      safeStoppedSession: "Sync stopped: your Amazon session looks expired. Sign in again, return to the Vine account page, then retry sync.",
      safeStoppedTimeout: "Sync stopped: page loading took too long. Check your connection, keep the tab open, then retry sync.",
      safeStoppedWithError: (errorText) => `Sync stopped safely: ${errorText}`,
      safeStoppedDefault: "Sync stopped safely. Retry sync in a few moments.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 more order allowed" : `${count} more orders allowed`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 more review needed" : `${count} more reviews needed`)
    },
    it: {
      syncButton: "Sincronizza la cronologia Vine",
      syncIconAlt: "Icona sincronizzazione",
      lastSyncLabel: "Ultima sincronizzazione:",
      never: "Mai",
      startingSync: "Avvio sincronizzazione...",
      syncingOrders: "Sincronizzazione ordini...",
      syncingReviews: "Sincronizzazione recensioni completate...",
      supportExtension: "Supporta questa estensione:",
      donateWithKofi: "Dona con Ko-fi",
      donateWithPaypal: "Dona con PayPal",
      syncStartFailedPrefix: "Avvio sincronizzazione non riuscito",
      labels: {
        orders: "Ordini",
        reviews: "Recensioni",
        rate: "Tasso recensioni"
      },
      riskByPeriod: {
        90: "Rischio elevato di Vine Jail",
        60: "Rischio moderato",
        30: "Rischio basso"
      },
      neutralRiskLabel: "Percentuale in zona sicura",
      periodTitle: (days) => `Ultimi ${days} giorni`,
      rateNA: "N/D",
      safeStoppedCaptcha: "Sincronizzazione interrotta: Amazon ha richiesto un CAPTCHA. Apri la pagina Vine, completa il CAPTCHA e riprova.",
      safeStoppedSession: "Sincronizzazione interrotta: la tua sessione Amazon sembra scaduta. Accedi di nuovo, torna alla pagina account Vine e riprova.",
      safeStoppedTimeout: "Sincronizzazione interrotta: il caricamento della pagina ha impiegato troppo tempo. Controlla la connessione, mantieni aperta la scheda e riprova.",
      safeStoppedWithError: (errorText) => `Sincronizzazione interrotta in sicurezza: ${errorText}`,
      safeStoppedDefault: "Sincronizzazione interrotta in sicurezza. Riprova tra qualche istante.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 ordine in più consentito" : `${count} ordini in più consentiti`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 recensione in più necessaria" : `${count} recensioni in più necessarie`)
    },
    es: {
      syncButton: "Sincronizar historial de Vine",
      syncIconAlt: "Icono de sincronizacion",
      lastSyncLabel: "Ultima sincronizacion:",
      never: "Nunca",
      startingSync: "Iniciando sincronizacion...",
      syncingOrders: "Sincronizando pedidos...",
      syncingReviews: "Sincronizando resenas completadas...",
      supportExtension: "Apoya esta extension:",
      donateWithKofi: "Donar con Ko-fi",
      donateWithPaypal: "Donar con PayPal",
      syncStartFailedPrefix: "No se pudo iniciar la sincronizacion",
      labels: {
        orders: "Pedidos",
        reviews: "Resenas",
        rate: "Tasa de resenas"
      },
      riskByPeriod: {
        90: "Riesgo alto de Vine Jail",
        60: "Riesgo moderado",
        30: "Riesgo bajo"
      },
      neutralRiskLabel: "Porcentaje en zona segura",
      periodTitle: (days) => `Ultimos ${days} dias`,
      rateNA: "N/D",
      safeStoppedCaptcha: "Sincronizacion interrumpida: Amazon solicito un CAPTCHA. Abre la pagina de Vine, completa el CAPTCHA y vuelve a intentarlo.",
      safeStoppedSession: "Sincronizacion interrumpida: tu sesion de Amazon parece caducada. Inicia sesion de nuevo, vuelve a la pagina de cuenta de Vine y reintenta.",
      safeStoppedTimeout: "Sincronizacion interrumpida: la carga de la pagina tardo demasiado. Revisa tu conexion, manten la pestana abierta y vuelve a intentarlo.",
      safeStoppedWithError: (errorText) => `Sincronizacion interrumpida de forma segura: ${errorText}`,
      safeStoppedDefault: "Sincronizacion interrumpida de forma segura. Reintenta en unos momentos.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 pedido mas permitido" : `${count} pedidos mas permitidos`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 resena mas necesaria" : `${count} resenas mas necesarias`)
    },
    de: {
      syncButton: "Vine-Verlauf synchronisieren",
      syncIconAlt: "Synchronisierungssymbol",
      lastSyncLabel: "Letzte Synchronisierung:",
      never: "Nie",
      startingSync: "Synchronisierung wird gestartet...",
      syncingOrders: "Bestellungen werden synchronisiert...",
      syncingReviews: "Abgeschlossene Rezensionen werden synchronisiert...",
      supportExtension: "Diese Erweiterung unterstutzen:",
      donateWithKofi: "Mit Ko-fi spenden",
      donateWithPaypal: "Mit PayPal spenden",
      syncStartFailedPrefix: "Synchronisierung konnte nicht gestartet werden",
      labels: {
        orders: "Bestellungen",
        reviews: "Rezensionen",
        rate: "Rezensionsrate"
      },
      riskByPeriod: {
        90: "Hohes Vine-Jail-Risiko",
        60: "Mittleres Risiko",
        30: "Niedriges Risiko"
      },
      neutralRiskLabel: "Prozentwert im sicheren Bereich",
      periodTitle: (days) => `Letzte ${days} Tage`,
      rateNA: "k.A.",
      safeStoppedCaptcha: "Synchronisierung unterbrochen: Amazon hat ein CAPTCHA angefordert. Öffne die Vine-Seite, löse das CAPTCHA und versuche es erneut.",
      safeStoppedSession: "Synchronisierung unterbrochen: Deine Amazon-Sitzung scheint abgelaufen zu sein. Melde dich erneut an, gehe zur Vine-Kontoseite und versuche es erneut.",
      safeStoppedTimeout: "Synchronisierung unterbrochen: Das Laden der Seite hat zu lange gedauert. Prüfe die Verbindung, halte den Tab offen und versuche es erneut.",
      safeStoppedWithError: (errorText) => `Synchronisierung sicher unterbrochen: ${errorText}`,
      safeStoppedDefault: "Synchronisierung sicher unterbrochen. Bitte in kurzer Zeit erneut versuchen.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 weitere Bestellung erlaubt" : `${count} weitere Bestellungen erlaubt`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 weitere Rezension erforderlich" : `${count} weitere Rezensionen erforderlich`)
    },
    fr: {
      syncButton: "Synchroniser l'historique Vine",
      syncIconAlt: "Icone de synchronisation",
      lastSyncLabel: "Derniere synchronisation:",
      never: "Jamais",
      startingSync: "Demarrage de la synchronisation...",
      syncingOrders: "Synchronisation des commandes...",
      syncingReviews: "Synchronisation des avis termines...",
      supportExtension: "Soutenez cette extension:",
      donateWithKofi: "Faire un don avec Ko-fi",
      donateWithPaypal: "Faire un don avec PayPal",
      syncStartFailedPrefix: "Echec du demarrage de la synchronisation",
      labels: {
        orders: "Commandes",
        reviews: "Avis",
        rate: "Taux d'avis"
      },
      riskByPeriod: {
        90: "Risque eleve de Vine Jail",
        60: "Risque modere",
        30: "Risque faible"
      },
      neutralRiskLabel: "Situation sous controle",
      periodTitle: (days) => `Derniers ${days} jours`,
      rateNA: "N/D",
      safeStoppedCaptcha: "Synchronisation interrompue: Amazon a demande un CAPTCHA. Ouvrez la page Vine, completez le CAPTCHA, puis reessayez.",
      safeStoppedSession: "Synchronisation interrompue: votre session Amazon semble expiree. Reconnectez-vous, revenez sur la page compte Vine, puis reessayez.",
      safeStoppedTimeout: "Synchronisation interrompue: le chargement de la page a pris trop de temps. Verifiez votre connexion, gardez l'onglet ouvert, puis reessayez.",
      safeStoppedWithError: (errorText) => `Synchronisation interrompue de facon securisee: ${errorText}`,
      safeStoppedDefault: "Synchronisation interrompue de facon securisee. Reessayez dans quelques instants.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 commande supplementaire autorisee" : `${count} commandes supplementaires autorisees`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 avis supplementaire necessaire" : `${count} avis supplementaires necessaires`)
    }
  };

  function resolveUiStrings(hostname) {
    const normalizedHost = (hostname || "").toLowerCase();
    const locale = HOST_LOCALE_MAP[normalizedHost] || DEFAULT_LOCALE;
    return UI_STRINGS[locale] || UI_STRINGS[DEFAULT_LOCALE];
  }

  const api = {
    resolveUiStrings
  };

  globalThis.RollingVineI18n = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();

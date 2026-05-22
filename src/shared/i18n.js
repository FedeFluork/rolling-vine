(function () {
  const DEFAULT_LOCALE = "en";
  const HOST_LOCALE_MAP = {
    "www.amazon.it": "it",
    "www.amazon.es": "es",
    "www.amazon.de": "de",
    "www.amazon.fr": "fr",
    "www.amazon.co.uk": "en",
    "www.amazon.com": "en",
    "www.amazon.ca": "en",
    "www.amazon.com.au": "en",
    "www.amazon.co.jp": "ja"
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
      firstScanNeeded: "First scan needed",
      periodTitle: (days) => `Last ${days} days`,
      rateNA: "N/A",
      safeStoppedCaptcha: "Sync stopped: Amazon requested a CAPTCHA. Open the Vine page, complete the CAPTCHA challenge, then retry sync.",
      safeStoppedSession: "Sync stopped: your Amazon session looks expired. Sign in again, return to the Vine account page, then retry sync.",
      safeStoppedTimeout: "Sync stopped: page loading took too long. Check your connection, keep the tab open, then retry sync.",
      safeStoppedWithError: (errorText) => `Sync stopped safely: ${errorText}`,
      safeStoppedDefault: "Sync stopped safely. Retry sync in a few moments.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 more order allowed" : `${count} more orders allowed`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 more review needed" : `${count} more reviews needed`),
      progressBar: {
        approved: "Approved",
        pending: "Pending approval",
        remaining: "Still to review"
      },
      popup: {
        noData: "No data yet. Run a sync from the Vine account page.",
        openAccount: "Open Vine Account",
        settings: "Settings"
      },
      options: {
        title: "Rolling Vine — Settings",
        themeLabel: "Theme",
        themeAuto: "Auto (detect from page)",
        themeLight: "Light",
        themeDark: "Dark",
        placementLabel: "Card placement",
        placementAbove: "Above official metrics",
        placementBelow: "Below official metrics",
        visibilityLabel: "Visible rolling periods",
        days90: "90 days (always visible)",
        days60: "60 days",
        days30: "30 days",
        languageLabel: "Language",
        languageAuto: "Auto (detect from domain)",
        resetButton: "Reset all settings and data",
        resetConfirm: "Are you sure? This will erase all extension data and settings.",
        savedNotice: "Changes will take effect next time you open the Vine account page. Reload it if already open.",
        saved: "Settings saved"
      }
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
      firstScanNeeded: "Prima scansione necessaria",
      periodTitle: (days) => `Ultimi ${days} giorni`,
      rateNA: "N/D",
      safeStoppedCaptcha: "Sincronizzazione interrotta: Amazon ha richiesto un CAPTCHA. Apri la pagina Vine, completa il CAPTCHA e riprova.",
      safeStoppedSession: "Sincronizzazione interrotta: la tua sessione Amazon sembra scaduta. Accedi di nuovo, torna alla pagina account Vine e riprova.",
      safeStoppedTimeout: "Sincronizzazione interrotta: il caricamento della pagina ha impiegato troppo tempo. Controlla la connessione, mantieni aperta la scheda e riprova.",
      safeStoppedWithError: (errorText) => `Sincronizzazione interrotta in sicurezza: ${errorText}`,
      safeStoppedDefault: "Sincronizzazione interrotta in sicurezza. Riprova tra qualche istante.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 ordine in più consentito" : `${count} ordini in più consentiti`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 recensione in più necessaria" : `${count} recensioni in più necessarie`),
      progressBar: {
        approved: "Approvate",
        pending: "In attesa di approvazione",
        remaining: "Ancora da recensire"
      },
      popup: {
        noData: "Nessun dato disponibile. Esegui una sincronizzazione dalla pagina account Vine.",
        openAccount: "Apri Account Vine",
        settings: "Impostazioni"
      },
      options: {
        title: "Rolling Vine — Impostazioni",
        themeLabel: "Tema",
        themeAuto: "Automatico (rileva dalla pagina)",
        themeLight: "Chiaro",
        themeDark: "Scuro",
        placementLabel: "Posizionamento card",
        placementAbove: "Sopra le metriche ufficiali",
        placementBelow: "Sotto le metriche ufficiali",
        visibilityLabel: "Periodi visibili",
        days90: "90 giorni (sempre visibile)",
        days60: "60 giorni",
        days30: "30 giorni",
        languageLabel: "Lingua",
        languageAuto: "Automatica (rileva dal dominio)",
        resetButton: "Ripristina impostazioni e dati",
        resetConfirm: "Sei sicuro? Questa azione cancellerà tutti i dati e le impostazioni dell'estensione.",
        savedNotice: "Le modifiche avranno effetto alla prossima apertura della pagina account Vine. Ricaricala se è già aperta.",
        saved: "Impostazioni salvate"
      }
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
      firstScanNeeded: "Primera sincronización necesaria",
      periodTitle: (days) => `Ultimos ${days} dias`,
      rateNA: "N/D",
      safeStoppedCaptcha: "Sincronizacion interrumpida: Amazon solicito un CAPTCHA. Abre la pagina de Vine, completa el CAPTCHA y vuelve a intentarlo.",
      safeStoppedSession: "Sincronizacion interrumpida: tu sesion de Amazon parece caducada. Inicia sesion de nuevo, vuelve a la pagina de cuenta de Vine y reintenta.",
      safeStoppedTimeout: "Sincronizacion interrumpida: la carga de la pagina tardo demasiado. Revisa tu conexion, manten la pestana abierta y vuelve a intentarlo.",
      safeStoppedWithError: (errorText) => `Sincronizacion interrumpida de forma segura: ${errorText}`,
      safeStoppedDefault: "Sincronizacion interrumpida de forma segura. Reintenta en unos momentos.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 pedido mas permitido" : `${count} pedidos mas permitidos`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 resena mas necesaria" : `${count} resenas mas necesarias`),
      progressBar: {
        approved: "Aprobadas",
        pending: "Pendientes de aprobación",
        remaining: "Aún por reseñar"
      },
      popup: {
        noData: "Sin datos. Ejecuta una sincronización desde la página de cuenta Vine.",
        openAccount: "Abrir Cuenta Vine",
        settings: "Configuración"
      },
      options: {
        title: "Rolling Vine — Configuración",
        themeLabel: "Tema",
        themeAuto: "Automático (detectar de la página)",
        themeLight: "Claro",
        themeDark: "Oscuro",
        placementLabel: "Posición de las tarjetas",
        placementAbove: "Encima de las métricas oficiales",
        placementBelow: "Debajo de las métricas oficiales",
        visibilityLabel: "Períodos visibles",
        days90: "90 días (siempre visible)",
        days60: "60 días",
        days30: "30 días",
        languageLabel: "Idioma",
        languageAuto: "Automático (detectar del dominio)",
        resetButton: "Restablecer configuración y datos",
        resetConfirm: "¿Estás seguro? Esto borrará todos los datos y configuraciones de la extensión.",
        savedNotice: "Los cambios se aplicarán la próxima vez que abras la página de cuenta Vine. Recárgala si ya está abierta.",
        saved: "Configuración guardada"
      }
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
      firstScanNeeded: "Erster Scan erforderlich",
      periodTitle: (days) => `Letzte ${days} Tage`,
      rateNA: "k.A.",
      safeStoppedCaptcha: "Synchronisierung unterbrochen: Amazon hat ein CAPTCHA angefordert. Öffne die Vine-Seite, löse das CAPTCHA und versuche es erneut.",
      safeStoppedSession: "Synchronisierung unterbrochen: Deine Amazon-Sitzung scheint abgelaufen zu sein. Melde dich erneut an, gehe zur Vine-Kontoseite und versuche es erneut.",
      safeStoppedTimeout: "Synchronisierung unterbrochen: Das Laden der Seite hat zu lange gedauert. Prüfe die Verbindung, halte den Tab offen und versuche es erneut.",
      safeStoppedWithError: (errorText) => `Synchronisierung sicher unterbrochen: ${errorText}`,
      safeStoppedDefault: "Synchronisierung sicher unterbrochen. Bitte in kurzer Zeit erneut versuchen.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 weitere Bestellung erlaubt" : `${count} weitere Bestellungen erlaubt`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 weitere Rezension erforderlich" : `${count} weitere Rezensionen erforderlich`),
      progressBar: {
        approved: "Genehmigt",
        pending: "Ausstehende Genehmigung",
        remaining: "Noch zu rezensieren"
      },
      popup: {
        noData: "Noch keine Daten. Führe eine Synchronisierung auf der Vine-Kontoseite durch.",
        openAccount: "Vine-Konto öffnen",
        settings: "Einstellungen"
      },
      options: {
        title: "Rolling Vine — Einstellungen",
        themeLabel: "Design",
        themeAuto: "Automatisch (von Seite erkennen)",
        themeLight: "Hell",
        themeDark: "Dunkel",
        placementLabel: "Kartenplatzierung",
        placementAbove: "Über den offiziellen Metriken",
        placementBelow: "Unter den offiziellen Metriken",
        visibilityLabel: "Sichtbare Zeiträume",
        days90: "90 Tage (immer sichtbar)",
        days60: "60 Tage",
        days30: "30 Tage",
        languageLabel: "Sprache",
        languageAuto: "Automatisch (vom Domain erkennen)",
        resetButton: "Einstellungen und Daten zurücksetzen",
        resetConfirm: "Bist du sicher? Alle Daten und Einstellungen der Erweiterung werden gelöscht.",
        savedNotice: "Änderungen werden beim nächsten Öffnen der Vine-Kontoseite wirksam. Lade sie neu, falls sie bereits geöffnet ist.",
        saved: "Einstellungen gespeichert"
      }
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
      firstScanNeeded: "Première synchronisation nécessaire",
      periodTitle: (days) => `Derniers ${days} jours`,
      rateNA: "N/D",
      safeStoppedCaptcha: "Synchronisation interrompue: Amazon a demande un CAPTCHA. Ouvrez la page Vine, completez le CAPTCHA, puis reessayez.",
      safeStoppedSession: "Synchronisation interrompue: votre session Amazon semble expiree. Reconnectez-vous, revenez sur la page compte Vine, puis reessayez.",
      safeStoppedTimeout: "Synchronisation interrompue: le chargement de la page a pris trop de temps. Verifiez votre connexion, gardez l'onglet ouvert, puis reessayez.",
      safeStoppedWithError: (errorText) => `Synchronisation interrompue de facon securisee: ${errorText}`,
      safeStoppedDefault: "Synchronisation interrompue de facon securisee. Reessayez dans quelques instants.",
      moreOrdersAllowed: (count) => (count === 1 ? "1 commande supplementaire autorisee" : `${count} commandes supplementaires autorisees`),
      moreReviewsNeeded: (count) => (count === 1 ? "1 avis supplementaire necessaire" : `${count} avis supplementaires necessaires`),
      progressBar: {
        approved: "Approuvés",
        pending: "En attente d'approbation",
        remaining: "Encore à évaluer"
      },
      popup: {
        noData: "Aucune donnée. Lancez une synchronisation depuis la page du compte Vine.",
        openAccount: "Ouvrir Compte Vine",
        settings: "Paramètres"
      },
      options: {
        title: "Rolling Vine — Paramètres",
        themeLabel: "Thème",
        themeAuto: "Automatique (détecter depuis la page)",
        themeLight: "Clair",
        themeDark: "Sombre",
        placementLabel: "Emplacement des cartes",
        placementAbove: "Au-dessus des métriques officielles",
        placementBelow: "En dessous des métriques officielles",
        visibilityLabel: "Périodes visibles",
        days90: "90 jours (toujours visible)",
        days60: "60 jours",
        days30: "30 jours",
        languageLabel: "Langue",
        languageAuto: "Automatique (détecter depuis le domaine)",
        resetButton: "Réinitialiser paramètres et données",
        resetConfirm: "Êtes-vous sûr ? Toutes les données et paramètres de l'extension seront supprimés.",
        savedNotice: "Les modifications prendront effet à la prochaine ouverture de la page compte Vine. Rechargez-la si elle est déjà ouverte.",
        saved: "Paramètres enregistrés"
      }
    },
    ja: {
      syncButton: "Vine履歴を同期",
      syncIconAlt: "同期アイコン",
      lastSyncLabel: "最終同期:",
      never: "未実行",
      startingSync: "同期を開始しています...",
      syncingOrders: "注文を同期しています...",
      syncingReviews: "完了したレビューを同期しています...",
      supportExtension: "この拡張機能を支援する:",
      donateWithKofi: "Ko-fiで寄付する",
      donateWithPaypal: "PayPalで寄付する",
      syncStartFailedPrefix: "同期の開始に失敗しました",
      labels: {
        orders: "注文",
        reviews: "レビュー",
        rate: "レビュー率"
      },
      riskByPeriod: {
        90: "Vine Jailの高リスク",
        60: "中程度のリスク",
        30: "低リスク"
      },
      neutralRiskLabel: "安全圏内の割合",
      firstScanNeeded: "初回スキャンが必要です",
      periodTitle: (days) => `過去${days}日間`,
      rateNA: "N/A",
      safeStoppedCaptcha: "同期が中断されました: AmazonがCAPTCHAを要求しました。Vineページを開き、CAPTCHAを完了してから再試行してください。",
      safeStoppedSession: "同期が中断されました: Amazonセッションが期限切れのようです。再度サインインし、Vineアカウントページに戻ってから再試行してください。",
      safeStoppedTimeout: "同期が中断されました: ページの読み込みに時間がかかりすぎました。接続を確認し、タブを開いたまま再試行してください。",
      safeStoppedWithError: (errorText) => `同期が安全に中断されました: ${errorText}`,
      safeStoppedDefault: "同期が安全に中断されました。しばらくしてから再試行してください。",
      moreOrdersAllowed: (count) => `あと${count}件の注文が可能`,
      moreReviewsNeeded: (count) => `あと${count}件のレビューが必要`,
      progressBar: {
        approved: "承認済み",
        pending: "承認待ち",
        remaining: "未レビュー"
      },
      popup: {
        noData: "データがありません。Vineアカウントページから同期を実行してください。",
        openAccount: "Vineアカウントを開く",
        settings: "設定"
      },
      options: {
        title: "Rolling Vine — 設定",
        themeLabel: "テーマ",
        themeAuto: "自動（ページから検出）",
        themeLight: "ライト",
        themeDark: "ダーク",
        placementLabel: "カード配置",
        placementAbove: "公式メトリクスの上",
        placementBelow: "公式メトリクスの下",
        visibilityLabel: "表示する期間",
        days90: "90日間（常に表示）",
        days60: "60日間",
        days30: "30日間",
        languageLabel: "言語",
        languageAuto: "自動（ドメインから検出）",
        resetButton: "設定とデータをリセット",
        resetConfirm: "本当によろしいですか？拡張機能のすべてのデータと設定が削除されます。",
        savedNotice: "変更はVineアカウントページを次に開いたときに反映されます。既に開いている場合はリロードしてください。",
        saved: "設定を保存しました"
      }
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

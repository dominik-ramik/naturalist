export function _t(tag, substitute) {
    return translate(tag, substitute);
}
export function _tf(tag, substitute) {
    return translate(tag, substitute, "<strong>", "</strong>");
}

export let i18n = {
    getDefaultTranslationLanguage: function() {
        return defaultLanguage;
    },
    getSupportedLanguageCodes: function() {
        return supportedLanguages;
    }
}

function translate(tag, substitute, preFormat, postFormat) {

    let lang = (m.route.param("l") ? m.route.param("l") : "");
    lang = lang.toLowerCase();
    if (supportedLanguages.indexOf(lang) < 0) {
        lang = defaultLanguage;
    }

    let source = null;
    if (translations.hasOwnProperty(tag)) {
        source = translations[tag];
    } else {
        console.log("Missing translation for: " + tag);
        return "[" + tag + "]";
    }

    let translated = "[tag]";

    if (source.hasOwnProperty(lang)) {
        translated = source[lang];
    } else if (source.hasOwnProperty(defaultLanguage)) {
        translated = source[defaultLanguage];
    }

    if (substitute) {
        if (!Array.isArray(substitute)) {
            substitute = [substitute];
        }
        if (substitute.length > 0) {
            substitute.forEach(function(subs, index) {
                translated = translated.replaceAll("$" + (index + 1), (preFormat ? preFormat : "") + subs + (postFormat ? postFormat : ""));
            });
        }
    }

    if (translated === "") {
        translated = tag;
    }

    return translated;
}

let defaultLanguage = "en";
let supportedLanguages = ["en", "fr"];
let translations = {
    tab_title_media: {
        "en": "Media",
        "fr": "Média"
    },
    tab_title_map: {
        "en": "Maps",
        "fr": "Cartes"
    },
    tab_title_text: {
        "en": "Texts",
        "fr": "Textes"
    },
    tab_title_externalsearch: {
        "en": "Search online",
        "fr": "Rechercher en ligne"
    },
    back_to_search: {
        "en": "Back to search",
        "fr": "Rétour à la recherche"
    },
    back_to_checklist: {
        "en": "Checklist results",
        "fr": "Liste des résultats"
    },
    float_filter: {
        "en": "Advanced search",
        "fr": "Recherche avancée"
    },
    float_results: {
        "en": "Show $1 results",
        "fr": "Afficher $1 résultats"
    },
    menu: {
        "en": "Menu",
        "fr": "Menu"
    },
    settings: {
        "en": "Settings",
        "fr": "Réglages"
    },
    about_this: {
        "en": "About this checklist",
        "fr": "Par rapport à cette liste taxonomique"
    },
    about_nl: {
        "en": "About NaturaList app",
        "fr": "Par rapport à l'appli NaturaList"
    },
    about_app: {
        "en": "# NaturaList\n\n## A flexible checklist app\n\n![NaturaList logo](img/icon.svg)\n\n**NaturaList** is a flexible taxonomic checklist app capable of visualizing a wide variety of data for both formal and indigenous / folk taxonomies with powerful filtering and search capacities.\n\n**NaturaList** doesn't come with a pre-defined set of taxonomic data you would have to fit your project in. You have the freedom to define what kind of data gets displayed and how. Your taxonomy data is pulled from a spreadsheet, making updates, change of appearance or even adding new kinds of information easy, without the need for extensive IT expertise and complex software packages.\n\n**NaturaList** has been originally developed for the [Checklist of the vascular flora of Vanuatu](https://pvnh.net) under the **Plants mo Pipol blong Vanuatu** (Plants and People of Vanuatu) project.\n\n## Get NaturaList\n\nVisit [naturalist.netlify.app](https://naturalist.netlify.app/) for more details about NaturaList app including its latest version and a demo implementation.\n\nRead the [app documentation](./docs/) to see how to build or manage your own checklist.\n\n## How to cite the app\n\nD.M. Ramík. 2022. NaturaList, a flexible taxonomic checklist app. (version $1)\n\n## Contact the author\n\nDominik M. Ramík, [dominik.ramik@seznam.cz](mailto:dominik.ramik@seznam.cz)",
        "fr": "# NaturaList\n\n## Une application de listes taxonomiques flexible\n\n![NaturaList logo](img/icon.svg)\n\n**NaturaList** est une application flexible de listes taxonomiques capable de visualiser une grande variété de données pour les taxonomies formelles et indigènes / folkloriques avec de puissantes capacités de filtrage et de recherche.\n\n**NaturaList** n'est pas livré avec un ensemble prédéfini de structures taxonomiques que vous auriez à adapter à votre projet. Vous avez la liberté de définir quel type de données est affiché et comment. Vos données taxonomiques sont extraites d'une feuille de calcul, ce qui facilite les mises à jour, les changements d'apparence ou même l'ajout de nouveaux types d'informations, sans avoir besoin d'une grande expertise informatique et de progiciels complexes. \n\n**NaturaList** a été développé à l'origine pour le [Checklist of the vascular flora of Vanuatu](https://pvnh.net) dans le cadre du projet **Plants mo Pipol blong Vanuatu** (Plantes et gens du Vanuatu).\n## Get NaturaList\n\nVisitez [naturalist.netlify.app](https://naturalist.netlify.app/) pour plus de détails sur l'application NaturaList, y compris sa dernière version et une démo.\n\nLisez la [documentation de l'application](./docs/) pour voir comment construire ou gérer votre propre liste taxonomique.\n\n## Comment citer l'appli\n\nD.M. Ramík. 2022. NaturaList, a flexible taxonomic checklist app. (version $1)\n\n## Contacter l'auteur\n\nDominik M. Ramík, [dominik.ramik@seznam.cz](mailto:dominik.ramik@seznam.cz)"
    },
    manage: {
        "en": "Manage",
        "fr": "Gérer"
    },
    search: {
        "en": "Search",
        "fr": "Rechercher"
    },
    docs: {
        "en": "App documentation",
        "fr": "Documentation de l'application"
    },
    next_items_dropdown: {
        "en": "Show next $1 items",
        "fr": "Afficher autres $1 items"
    },
    next_items_checklist: {
        "en": "Show next $1 search results",
        "fr": "Afficher autres $1 résultats de la recherche"
    },
    no_items_filter: {
        "en": "No matching items found",
        "fr": "Aucun élément correspondant trouvé"
    },
    reset_filter: {
        "en": "Clear filter",
        "fr": "Effacer le filtre"
    },
    free_text_search: {
        "en": "Full-text search",
        "fr": "Recherche plein texte"
    },
    languages: {
        "en": "Other languages",
        "fr": "Autres langues"
    },
    copy_taxa_dropdown: {
        "en": "Copy $1 taxa results of this search",
        "fr": "Copier les résultats de cette recherche pour $1 taxa"
    },
    filter_taxa_levels: {
        "en": "View",
        "fr": "Affichage"
    },
    pin_search: {
        "en": "Pin search",
        "fr": "Épingler la requête"
    },
    share_url: {
        "en": "Share results",
        "fr": "Partager les résultats"
    },
    nothing_found_oops: {
        "en": "Oops!",
        "fr": "Oups !"
    },
    nothing_found_checklist: {
        "en": "We searched the world for you, but found nothing that matches your query",
        "fr": "Nous avons cherché dans le monde entier pour vous, mais nous n'avons rien trouvé qui corresponde à votre requête."
    },
    temporary_filter: {
        "en": "Simplified view showing only taxa down to <strong>$1</strong> level.",
        "fr": "Vue simplifiée montrant uniquement les taxons jusqu'au niveau <strong>$1</strong>."
    },
    temporary_filter_show_all: {
        "en": "Show all information",
        "fr": "Afficher toutes les informations"
    },
    temporary_draft_goto_manage: {
        "en": "Manage",
        "fr": "Gérer"
    },
    cancel_details_filter: {
        "en": "Show all information (default view)",
        "fr": "Afficher toutes les informations (vue par défaut)"
    },
    pin_this_search: {
        "en": "Pin this search",
        "fr": "Épingler cette recherche"
    },
    and_list_joiner: {
        "en": "and",
        "fr": "et"
    },
    or_list_joiner: {
        "en": "or",
        "fr": "ou"
    },
    is_list_joiner: {
        "en": "is",
        "fr": "est"
    },
    text_is_list_joiner: {
        "en": "contains text",
        "fr": "contient le texte"
    },
    show_all_of_taxon: {
        "en": "Show all $1",
        "fr": "Afficher tout $1"
    },
    draft_notice: {
        "en": "You are viewing a draft version of the checklist only visible to you. Click on Manage to manage the data or refresh the page to show the current published data.",
        "fr": "Vous visualisez une version brouillon de la liste qui n'est visible que par vous. Cliquez sur Gérer pour gérer les données ou rafraîchissez la page pour afficher les données publiées actuelles."
    },
    in_taxon_group: {
        "en": "$1 $2",
        "fr": "$1 $2"
    },
    list_of_taxa: {
        "en": "List of $1 taxa",
        "fr": "Liste de $1 taxons"
    },
    taxon: {
        "en": "Taxon",
        "fr": "Taxon"
    },
    show_map: {
        "en": "Show map: ",
        "fr": "Montrer la carte: "
    },
    default_legend: {
        "en": "Present",
        "fr": "Présent"
    },
    generic_about: {
        "en": "This checklist has been created using NaturaList app",
        "fr": "Cette liste a été créée à l'aide de l'appli NaturaList."
    },
    data_upload_processing: {
        "en": "Processing the spreadsheet data",
        "fr": "Traitement des données de la feuille de calcul"
    },
    data_upload_waiting: {
        "en": "Start by uploading a spreadsheet containing your checklist and all the necessary settings.",
        "fr": "Commencez par télécharger une feuille de calcul contenant votre check-list et tous les paramètres nécessaires."
    },
    starting_from_scratch: {
        "en": "Starting from a scratch? Download a <a href='./docs/blank-naturalist-spreadsheet.xlsx'>blank spreadsheet</a> and read the <a href='./docs/'>documentation</a> to see how to fill it in with your own data.",
        "fr": "Vous partez de zéro ? Téléchargez une <a href='./docs/blank-naturalist-spreadsheet.xlsx'>feuille de calcul vierge</a> et lisez la <a href='./docs/'>documentation</a> pour savoir comment la remplir avec vos propres données."
    },
    starting_from_scratch_continued: {
        "en": "Once your checklist spreadsheet is ready, upload it by clicking on the button below.",
        "fr": "Une fois que votre feuille de calcul est prête, chargez-la en cliquant sur le bouton ci-dessous."
    },
    useful_links: {
        "en": "You may also check out the [NaturaList web](https://naturalist.netlify.app/) and our [GitHub repo](https://github.com/dominik-ramik/naturalist) for more information",
        "fr": "Vous pouvez également consulter le [site web NaturaList](https://naturalist.netlify.app/) et le [repo GitHub](https://github.com/dominik-ramik/naturalist) pour plus d'informations"
    },
    review_draft_heading: {
        "en": "Review the draft",
        "fr": "Revoir le brouillon"
    },
    review_draft: {
        "en": "Check the draft version of your updated checklist. You can go back to search, verify the data and come back by clicking on the Manage button.",
        "fr": "Vérifiez la version brouillon de votre liste mise à jour. Vous pouvez passer à la recherche, vérifier les données et revenir en cliquant sur le bouton Gérer."
    },
    not_all_good: {
        "en": "Spotted some glitches?",
        "fr": "Vous avez repéré des problèmes ?"
    },
    back_to_upload: {
        "en": "Upload the fixed spreadsheet",
        "fr": "Téléchargez la feuille de calcul améliorée"
    },
    all_good: {
        "en": "All looks right?",
        "fr": "Tout semble correct ?"
    },
    proceed_to_update: {
        "en": "Publish the update",
        "fr": "Publier la mise à jour"
    },
    data_upload_import_dirty: {
        "en": "Some problems with your spreadsheet to be addressed before you can proceed:",
        "fr": "Certains problèmes de votre feuille de calcul doivent être réglés avant que vous puissiez continuer :"
    },
    data_upload_integrate_data: {
        "en": "Publish the update directly",
        "fr": "Publier la mise à jour directement"
    },
    click_to_upload: {
        "en": "Click to upload a checklist spreadsheet",
        "fr": "Cliquez pour télécharger une feuille de calcul de la liste"
    },
    or_drag_it: {
        "en": "or drag and drop it here",
        "fr": "ou faites-le glisser et déposez-le ici"
    },
    fresh_install_welcome: {
        "en": "Welcome!",
        "fr": "Bienvenue!"
    },
    fresh_install_welcome_message: {
        "en": "Looks like a fresh NaturaList here. Glad to have you onboard.",
        "fr": "On dirait un NaturaList tout frais. Contents de vous avoir à bord."
    },
    no_data: {
        "en": "There is no data yet in this checklist. Publish your data using this form.",
        "fr": "Il n'y a pas encore de données dans cette liste. Publiez vos données en utilisant ce formulaire."
    },
    update_published: {
        "en": "The update has been published and will be available shortly to your users",
        "fr": "La mise à jour a été publiée et sera bientôt disponible pour vos utilisateurs."
    },
    error_publishing: {
        "en": "Error while uploading",
        "fr": "Erreur lors du chargement"
    },
    done: {
        "en": "Done!",
        "fr": "C'est fait !"
    },
    manage_back_to_search: {
        "en": "Back to search",
        "fr": "Rétour à la recherche"
    },
    enter_creds_to_publish: {
        "en": "Enter your user name and password and publish the updated checklist so that everyone can see it.",
        "fr": "Saisissez votre nom d'utilisateur et votre mot de passe et publiez la liste mise à jour afin que tout le monde puisse la voir."
    },
    user_name: {
        "en": "User name",
        "fr": "Nom de l'utilisateur"
    },
    password: {
        "en": "Password",
        "fr": "Mot de passe"
    },
    publish_checklist: {
        "en": "Publish checklist data file",
        "fr": "Publier le fichier de données de la liste"
    },
    download_data: {
        "en": "Download the data",
        "fr": "Télécharger les données"
    },
    download_for_manual_update: {
        "en": "You can download the checklist data file and use it for a manual update if you use a static web hosting, or keep it for archivation purposes. No change will be done to the currently published checklist unless you upload the data file to the 'data' folder on your site. See the [documentation](./docs/) for more information.",
        "fr": "Vous pouvez télécharger le fichier de données de la liste et l'utiliser pour une mise à jour manuelle si vous utilisez un hébergement web statique, ou le conserver à des fins d'archivage. Aucune modification ne sera apportée à la liste de contrôle actuellement publiée si vous ne chargez pas le fichier de données dans le dossier 'data' de votre site. Consultez la [documentation](./docs/) pour plus d'informations."
    },
    download_checklist: {
        "en": "Download checklist data file",
        "fr": "Télécharger le fichier de données de la liste"
    },
    chose_a_file: {
        "en": "You need to chose a file",
        "fr": "Vous devez choisir un fichier"
    },
    wrong_filetype: {
        "en": "Wrong file type. You need to upload an Excel spreadsheet (extension .xlsx)",
        "fr": "Mauvais type de fichier. Vous devez charger une feuille de calcul Excel (extension .xlsx)."
    },
    network_error: {
        "en": "Network error",
        "fr": "Erreur de réseau"
    },
    upload_disabled: {
        "en": "Direct upload has been disabled by the administrator (or you are experiencing a temporary issue with connectivity). You may opt for downloading the data and manually upload them to the server e.g. through FTP.",
        "fr": "Le chargement direct a été désactivé par l'administrateur (ou vous rencontrez un problème temporaire de connectivité). Vous pouvez opter pour le téléchargement des données et les charger manuellement sur le serveur par ex. via FTP."
    },
    no_credentials_received: {
        "en": "No credentials received",
        "fr": "Aucune information d'identification reçue"
    },
    auth_failed: {
        "en": "Authentication failed",
        "fr": "Échec de l'authentification"
    },
    back_to_upload_after_error: {
        "en": "Back to spreadsheet upload",
        "fr": "Retour au chargement de la feuille de calcul"
    },
    processing: {
        "en": "Processing",
        "fr": "Traitement"
    },
    this_may_take_time: {
        "en": "Relax. This may take some time, especially if your spreadsheet has thousands of entries.",
        "fr": "Détendez-vous. Cela peut prendre un certain temps, surtout si votre feuille de calcul comporte des milliers d'entrées."
    },
    server_returned_odd_message: {
        "en": "The server returned an unexpected response. You may need to change the configuration of your PHP server or contact the author of this app.",
        "fr": "Le serveur a renvoyé une réponse inattendue. Vous devez peut-être modifier la configuration de votre serveur PHP ou contacter l'auteur de cette application."
    },
    server_returned_odd_message_details: {
        "en": "Here are details: ",
        "fr": "Voici les détails : "
    },
    checklist_data_updated: {
        "en": "Checklist data updated",
        "fr": "Données de la liste mises à jour"
    },
    offline_fetch_failed: {
        "en": "Could not load some resources from the network. Are you offline?",
        "fr": "Impossible de charger certaines ressources du réseau. Êtes-vous hors ligne ?"
    },
    apply_selection: {
        "en": "Apply",
        "fr": "Appliquer"
    },
    powered_by_nl: {
        "en": "Powered by NaturaList",
        "fr": "Powered by NaturaList"
    },
    numeric_filter_equal: {
        "en": "Equals",
        "fr": "Égal à"
    },
    numeric_filter_equal_short: {
        "en": "=",
        "fr": "="
    },
    numeric_filter_lesser: {
        "en": "Less than",
        "fr": "Moins que"
    },
    numeric_filter_lesser_short: {
        "en": "<",
        "fr": "<"
    },
    numeric_filter_lesserequal: {
        "en": "Less or equal than",
        "fr": "Inférieur ou égal à"
    },
    numeric_filter_lesserequal_short: {
        "en": "<=",
        "fr": "<="
    },
    numeric_filter_greater: {
        "en": "More than",
        "fr": "Supérieur que"
    },
    numeric_filter_greater_short: {
        "en": ">",
        "fr": ">"
    },
    numeric_filter_greaterequal: {
        "en": "More or equal than",
        "fr": "Supérieur ou égal à"
    },
    numeric_filter_greaterequal_short: {
        "en": ">=",
        "fr": ">="
    },
    numeric_filter_between: {
        "en": "Between",
        "fr": "Entre"
    },
    numeric_filter_between_short: {
        "en": "between",
        "fr": "entre"
    },
    numeric_filter_and: {
        "en": "and",
        "fr": "et"
    },
    numeric_filter_around: {
        "en": "Falls into",
        "fr": "Situé à l'intérieur"
    },
    numeric_filter_around_short: {
        "en": "falls into",
        "fr": "situé à l'intérieur"
    },
    numeric_filter_plusminus: {
        "en": "±",
        "fr": "±"
    },
    numeric_filter_select: {
        "en": "Select one of the operations above",
        "fr": "Sélectionnez l'une des opérations ci-dessus"
    },
    numeric_apply_show_results_no_results: {
        "en": "No matching results",
        "fr": "Aucun résultat correspondant"
    },
    numeric_apply_show_results: {
        "en": "Show $1 results",
        "fr": "Afficher $1 résultats"
    },
    histogram_all_data: {
        "en": "All data",
        "fr": "Toutes les données"
    },
    histogram_displayed_data: {
        "en": "Currently displayed data",
        "fr": "Données actuellement affichées"
    },
    stats_min: {
        "en": "Minimum",
        "fr": "Minimum"
    },
    stats_max: {
        "en": "Maximum",
        "fr": "Maximum"
    },
    stats_avg: {
        "en": "Average",
        "fr": "Moyenne"
    },
    stats_distinct: {
        "en": "Distinct values",
        "fr": "Valeurs distinctes"
    },
    log_error: {
        "en": "Error",
        "fr": "Erreur"
    },
    log_warning: {
        "en": "Warning",
        "fr": "Avertissement"
    },
    dm_array_with_empty_cells_in_the_middle: {
        "en": "Check the column $1$2 of the following row in the checklist sheet. There should be no empty cell at that index: $3",
        "fr": "La colonne $1 du tableau $2 ne peut pas avoir d'indicateurs de langue ($3)"
    },
    dm_cannot_have_language_indicators: {
        "en": "Column $1 in table $2 cannot have language indicators ($3)",
        "fr": "La colonne $1 du tableau $2 ne peut pas avoir d'indicateurs de langue ($3)"
    },
    dm_specify_fallback_language: {
        "en": "Language $1 in table $2 (sheet $3) doesn not have any existing fallback language, enter on of the following language codes into the fallback language column to ensure proper displaying, or else the application interface will fall back to English",
        "fr": "Si la langue $1 du tableau $2 (feuille $3) n'a pas de langue de repli, entrez l'un des codes de langue suivants dans la colonne de langue de repli pour garantir un affichage correct, sinon l'interface de l'application reviendra à l'anglais"
    },
    dm_cannot_find_sheet: {
        "en": "Cannot find the sheet $1 in your file",
        "fr": "Impossible de trouver la feuille $1 dans votre fichier"
    },
    dm_column_defined_but_missing: {
        "en": "Column $1 is defined in the $2 table but it is missing in your checklist sheet; you need to add it into the checklist sheet or remove it from the $3 table",
        "fr": "La colonne $1 est définie dans le tableau $2 mais elle est absente de votre feuille de check-list ; vous devez l'ajouter dans la feuille de check-list ou la supprimer du tableau $3"
    },
    dm_column_names_duplicate: {
        "en": "Multiple columns in the checklist sheet have the header $1, only one column should be called so in order to avoid ambiguities",
        "fr": "Plusieurs colonnes de la feuille de check-list ont l'en-tête $1, une seule colonne doit être appelée ainsi afin d'éviter toute ambiguïté"
    },
    dm_incomplete_taxa_info_row: {
        "en": "In checklist sheet on line $1 review the content of taxa columns (in particular $2); each line should have a complete set of taxonomic units from the topmost down to the level you choose, but the levels in between need to be filled",
        "fr": "Dans la feuille de check-list, à la ligne $1, examinez le contenu des colonnes de taxons (en particulier $2) ; chaque ligne doit comporter un ensemble complet d'unités taxonomiques, de la plus haute jusqu'au niveau choisi, mais les niveaux intermédiaires doivent être remplis"
    },
    dm_defined_column_not_present: {
        "en": "You defined column $1 in the table $2 (sheet $3), but the column is not present in the checklist spreadsheet; this could only occur if the value of the column was not used and the column relied on a template using only data of other columns (which is not this case)",
        "fr": "Vous avez défini la colonne $1 dans le tableau $2 (feuille $3), mais la colonne n'est pas présente dans la feuille de check-list ; cela ne peut se produire que si la valeur de la colonne n'a pas été utilisée et que la colonne s'appuie sur un modèle utilisant uniquement les données d'autres colonnes (ce qui n'est pas le cas ici)"
    },
    dm_media_column_names: {
        "en": "Error in column names for media $1 in the checklist sheet; you need to use either a single column called $2 with the media source in it, or two columns called $3 and $4 in which the media source and title is put respectively",
        "fr": "Erreur dans les noms de colonnes pour le média $1 dans la feuille de check-list ; vous devez utiliser soit une seule colonne appelée $2 avec la source du média dedans, soit deux colonnes appelées $3 et $4 dans lesquelles la source du média et le titre sont mis respectivement."
    },
    dm_taxon_column_names: {
        "en": "Error in column names for taxon $1 in the checklist sheet; you need to use either a single column called $2 with the taxon name in it, or two columns called $3 and $4 in which the taxon name and authority is put respectively",
        "fr": "Erreur dans les noms de colonnes pour le taxon $1 dans la feuille de check-list ; vous devez utiliser soit une seule colonne appelée $2 avec le nom du taxon dedans, soit deux colonnes appelées $3 et $4 dans lesquelles le nom du taxon et l'autorité sont mis respectivement."
    },
    dm_value_cannot_be_empty: {
        "en": "Value in column $1 in table $2 cannot be empty",
        "fr": "La valeur de la colonne $1 du tableau $2 ne peut pas être vide"
    },
    dm_incorrect_list: {
        "en": "Incorrect value$1 in column $2 (table $3); allowed values are: $4",
        "fr": "Valeur$1 incorrecte dans la colonne $2 (tableau $3) ; les valeurs autorisées sont : $4"
    },
    dm_incorrect_simple_column_name: {
        "en": "Incorrect value $1 in column $2 (table $3); The column name should only be composed of lowercase or uppercase letters without accents",
        "fr": "Valeur incorrecte $1 dans la colonne $2 (table $3) ; Le nom de la colonne doit être composé uniquement de lettres minuscules ou majuscules sans accents"
    },
    dm_incorrect_hlsa: {
        "en": "Incorrect value $1 in column $2 (table $3); The value should be a color in CSS notation (name, rgb, rgba, hsl or hsla)",
        "fr": "Valeur $1 incorrecte dans la colonne $2 (table $3) ; La valeur doit être une couleur en notation CSS (nom, rgb, rgba, hsl ou hsla)"
    },
    dm_incorrect_filename: {
        "en": "Incorrect value $1 in column $2 (table $3); The value should be a filename (allowed extensions: $4)",
        "fr": "Valeur $1 incorrecte dans la colonne $2 (table $3) ; La valeur doit être un nom de fichier (extensions autorisées : $4)"
    },
    dm_incorrect_http: {
        "en": "Incorrect value $1 in column $2 (table $3); The value should be a valid URL begining with HTTP or HTTPS",
        "fr": "Valeur incorrecte $1 dans la colonne $2 (table $3) ; La valeur doit être une URL valide commençant par HTTP ou HTTPS"
    },
    dm_incorrect_datapath: {
        "en": "Incorrect value $1 in column $2 (table $3); The column name should be a valid data path (see documentation)",
        "fr": "Valeur $1 incorrecte dans la colonne $2 (table $3) ; Le nom de la colonne doit être un chemin de données valide (voir la documentation)"
    },
    dm_incorrect_must_be_unique: {
        "en": "Value $1 in column $2 in table $3 must be unique, appearing only once in the column",
        "fr": "La valeur $1 de la colonne $2 du tableau $3 doit être unique et n'apparaître qu'une seule fois dans la colonne"
    },
    dm_column_name_duplicate: {
        "en": "Column name $1 in table $2 is a duplicate already used in table $3, you need to rename one or the other as all column names must be unique",
        "fr": "Le nom de la colonne $1 dans la table $2 est un doublon déjà utilisé dans la table $3, vous devez renommer l'un ou l'autre car tous les noms de colonnes doivent être uniques"
    },
    dm_hue_value: {
        "en": "The hue in table $1 under item 'Color theme hue' has to be an integer number between 0 and 360",
        "fr": "La teinte dans le tableau $1 sous l'item 'Color theme hue' doit être un nombre entier entre 0 et 360"
    },
    dm_wrong_placement: {
        "en": "$1 cannot be in placement $2; only its root ($3) should have its placement asigned",
        "fr": "$1 ne peut pas être dans le placement $2 ; seule sa racine ($3) devrait avoir son placement assigné"
    },
    dm_wrong_template: {
        "en": "Column $1 cannot have a template assigned, this can be only done for column names representing a simple value, with no child items",
        "fr": "La colonne $1 ne peut pas avoir de modèle (template) défini, ceci ne peut être fait que pour les noms de colonnes représentant une valeur simple, sans élément enfant."
    },
    dm_wrong_badge: {
        "en": "Column $1 cannot have 'badge' format set in $2 column, this can be only done for column names representing a simple value, with no child items",
        "fr": "Le format 'badge' ne peut pas être défini pour la colonne nommée $1 dans la colonne $2, ceci ne peut être fait que pour les noms de colonnes représentant une valeur simple, sans éléments déscendants"
    },
    dm_wrong_separator: {
        "en": "Column $1 cannot have a separator set in $2 column, this can be only done for column names representing a simple value, with no child items",
        "fr": "La colonne nommée $1 ne peut pas avoir de séparateur dans la colonne $2, ceci ne peut être fait que pour les noms de colonnes représentant une valeur simple, sans éléments déscendants"
    },
    dm_hidden_column_name: {
        "en": "Column $1 is set to be hidden, the value of column $2 won't have any effect",
        "fr": "La colonne $1 est définie comme étant cachée, la valeur de la colonne $2 n'aura aucun effet"
    },
    dm_hidden_missing_index: {
        "en": "You are missing index $1 in your $2 table in column $3",
        "fr": "Il vous manque l'index $1 dans votre table $2 dans la colonne $3"
    },
    dm_column_not_found: {
        "en": "Could not find column $1 in table $2",
        "fr": "Impossible de trouver la colonne $1 dans le tableau $2"
    },
    dm_duplicate_segment: {
        "en": "Reading checklist data, there is a duplicity in $1",
        "fr": "En lisant les données du check-list, on constate qu'il y a une duplicité dans $1"
    },
    dm_value_not_number: {
        "en": "Value $1 in column $2 of checklist data should be a number",
        "fr": "La valeur $1 de la colonne $2 des données du check-list doit être un nombre"
    },
    filter_or: {
        "en": "or",
        "fr": "ou"
    },
    filter_cat_text: {
        "en": "Contains text",
        "fr": "Contient le texte"
    },
    check_all_shown: {
        "en": "Check all shown items",
        "fr": "Cocher tous les éléments affichés"
    },
}
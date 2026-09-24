# Séquoria — site vitrine

Site animé pour Séquoria, litière en copeaux de carton pour chevaux et petits animaux (NAC).
HTML, CSS et JavaScript natifs : aucune dépendance, aucune étape de build.

## Lancer en local

```bash
python3 -m http.server 4173
```

Puis ouvrir http://localhost:4173.

## Pages

| Adresse | Fichier | Contenu |
| --- | --- | --- |
| `/` | `index.html` | Accueil |
| `/litiere-chevaux/` | `litiere-chevaux/index.html` | Fiche produit chevaux (sac de 20 kg) et estimateur de quantités |
| `/litiere-nac/` | `litiere-nac/index.html` | Fiche produit petits animaux (sac de 2 kg) |
| `/tarifs/` | `tarifs/index.html` | Grille tarifaire (litière chevaux) et tarifs petits animaux sur demande |
| `/contact/` | `contact/index.html` | Formulaire de demande de devis |
| `/mentions-legales/` | `mentions-legales/index.html` | Mentions légales |
| `/confidentialite/` | `confidentialite/index.html` | Politique de confidentialité (RGPD) |
| — | `404.html` | Page d’erreur « page introuvable » |

Chaque page vit dans son propre dossier : les adresses restent courtes (`/contact/`).

## Structure

```
assets/
  css/style.css          styles communs à toutes les pages
  js/main.js             animations, menu, estimateur, formulaire
  img/photos/            photos Séquoria (JPEG, et AVIF quand disponible)
  img/illustrations/     visuels de la section « La matière »
  img/icons/             favicon et icônes pour téléphones
  img/og-image.jpg       image affichée lors d’un partage sur les réseaux sociaux
robots.txt, sitemap.xml  référencement
site.webmanifest         nom et icônes du site sur mobile
```

La navigation, le menu et le pied de page sont répétés dans chaque page :
une modification de ces blocs est à reporter dans les huit fichiers HTML.

## À compléter avant la mise en ligne

- **Mentions légales et confidentialité** : les informations surlignées (raison sociale, SIRET, hébergeur…) sont à remplir, puis retirer la classe `todo`.
- **Adresse e-mail** : remplacer `contact@example.com` dans toutes les pages.
- **Formulaire de devis** : sans configuration, il ouvre la messagerie du visiteur avec la demande pré-remplie. Pour recevoir les demandes directement, créez un formulaire chez un service comme Formspree et renseignez son adresse dans l’attribut `data-endpoint` du formulaire (`contact/index.html`).
- **Réseaux sociaux** : remplacer les liens `#` du pied de page.
- **Chiffres** : chiffres clés, tableau comparatif, quantités du mode d’emploi et de l’estimateur sont indicatifs, à valider avec vos données.
- **Logo** : la navigation affiche le nom en texte ; vous pouvez y placer votre logo (SVG).
- **Polices** : chargées depuis Google Fonts (Instrument Serif, Fraunces). Pour le RGPD, vous pouvez les héberger sur le site.

## Mise en ligne avec GitHub Pages

Le site est prêt à être publié à l’adresse **https://dynaspley.github.io/Sequoria/** :

1. Envoyer le dépôt sur GitHub (dans GitHub Desktop : **Push origin**).
2. Sur github.com, dans le dépôt « Sequoria » : **Settings → Pages**, source « Deploy from a branch », branche `main`, dossier `/ (root)`, puis **Save**.
3. Après une à deux minutes, le site est en ligne : c’est ce lien qu’il suffit de partager.

Avec un compte GitHub gratuit, GitHub Pages ne fonctionne que si le dépôt est **public**
(Settings → General → Danger Zone → Change repository visibility).

Pour passer plus tard sur votre propre nom de domaine : remplacer `https://dynaspley.github.io/Sequoria/`
dans les pages (balises `canonical` et `og:`), `robots.txt` et `sitemap.xml`, et `/Sequoria/` par `/` dans `404.html`.
Le fichier `.nojekyll` demande à GitHub de publier les fichiers tels quels.

Après chaque modification du CSS ou du JS, incrémentez le `?v=` de leurs liens dans les pages pour éviter que les visiteurs gardent l’ancienne version en cache.

Pour convertir des images en AVIF, utilisez un encodeur web (Squoosh, `avifenc`…) : les AVIF produits par `sips` sous macOS ne s’affichent pas dans Chrome.

Les animations respectent le réglage système « réduire les animations », et tout le contenu reste lisible sans JavaScript.

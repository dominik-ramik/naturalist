import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../../model/nlDataStructureSheets";

export const SCOPE_CHOICES = [
  {
    id: ANALYTICAL_INTENT_TAXA,
    label: "Taxa",
    iconPath: {
      light: "./img/ui/checklist/taxonomy-light.svg",
      dark: "./img/ui/checklist/taxonomy.svg",
    },
    info: "Analyze data diversity and distribution at the taxonomic level"
  },
  {
    id: ANALYTICAL_INTENT_OCCURRENCE,
    label: "Occurrences",
    iconPath: {
      light: "./img/ui/checklist/tag-light.svg",
      dark: "./img/ui/checklist/tag.svg",
    },
    info: "Analyze the data at the resolution of individual occurrences"
  },
];

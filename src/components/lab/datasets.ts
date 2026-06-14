/**
 * Small, bundled toy datasets for the Lab's data/ML widgets. Synthetic but
 * realistic, with clearly separable clusters so patterns are visible to a kid.
 * Kept tiny (a few dozen rows). Shared by DataExplorer (and later TreeExplorer
 * / NeuronViz / RegressionPlayground).
 */

export interface DataPoint {
  features: Record<string, number>;
  label: string;
}

export interface Dataset {
  id: string;
  name: string;
  featureNames: string[];
  classes: string[];
  points: DataPoint[];
  /** Plain-language one-liner shown above the chart. */
  summary: string;
  /** Friendly units/labels for axes (keyed by feature name). */
  units?: Record<string, string>;
}

function pt(label: string, petalLength: number, petalWidth: number, height: number): DataPoint {
  return { label, features: { petalLength, petalWidth, height } };
}

/** Three kinds of flower, told apart by simple measurements. */
const FLOWERS: Dataset = {
  id: "flowers",
  name: "Flowers",
  featureNames: ["petalLength", "petalWidth", "height"],
  units: { petalLength: "cm", petalWidth: "cm", height: "cm" },
  classes: ["Daisy", "Tulip", "Rose"],
  summary: "30 flowers · 3 kinds · 3 measurements each",
  points: [
    // Daisy — small petals, short stems
    pt("Daisy", 1.4, 0.3, 14), pt("Daisy", 1.6, 0.2, 16), pt("Daisy", 1.3, 0.4, 13),
    pt("Daisy", 1.7, 0.3, 17), pt("Daisy", 1.5, 0.2, 15), pt("Daisy", 1.4, 0.3, 12),
    pt("Daisy", 1.8, 0.4, 18), pt("Daisy", 1.2, 0.2, 14), pt("Daisy", 1.6, 0.3, 16),
    pt("Daisy", 1.5, 0.3, 15),
    // Tulip — medium petals, medium stems
    pt("Tulip", 4.3, 1.3, 34), pt("Tulip", 4.6, 1.5, 36), pt("Tulip", 4.1, 1.2, 32),
    pt("Tulip", 4.8, 1.4, 38), pt("Tulip", 4.4, 1.3, 35), pt("Tulip", 4.7, 1.6, 37),
    pt("Tulip", 4.2, 1.2, 33), pt("Tulip", 4.5, 1.5, 36), pt("Tulip", 4.9, 1.4, 39),
    pt("Tulip", 4.4, 1.3, 34),
    // Rose — big petals, tall stems
    pt("Rose", 5.6, 2.1, 52), pt("Rose", 5.9, 2.3, 55), pt("Rose", 5.4, 1.9, 49),
    pt("Rose", 6.1, 2.2, 57), pt("Rose", 5.7, 2.0, 53), pt("Rose", 6.0, 2.4, 56),
    pt("Rose", 5.3, 1.8, 50), pt("Rose", 5.8, 2.1, 54), pt("Rose", 6.2, 2.3, 58),
    pt("Rose", 5.6, 2.0, 52),
  ],
};

export const DATASETS: Record<string, Dataset> = {
  flowers: FLOWERS,
};

export function getDataset(id: string | undefined): Dataset {
  return (id && DATASETS[id]) || FLOWERS;
}

/** A friendly label for a feature key. */
export function featureLabel(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/** Class colors, shared across widgets. */
export const CLASS_COLORS = ["#ff004d", "#00e0c0", "#c084fc", "#ffb000", "#3b82f6"];

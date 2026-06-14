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

function pt2(label: string, sweetness: number, size: number): DataPoint {
  return { label, features: { sweetness, size } };
}

/** Two fruits, two features — perfect for a single decision-tree split (with a
 * little overlap so one split isn't 100% accurate). */
const FRUIT2D: Dataset = {
  id: "fruit2d",
  name: "Fruit",
  featureNames: ["sweetness", "size"],
  classes: ["Apple", "Lemon"],
  summary: "20 fruits · 2 kinds · 2 measurements (sweetness & size)",
  points: [
    pt2("Apple", 8, 7), pt2("Apple", 7, 6), pt2("Apple", 9, 8), pt2("Apple", 6.5, 5.5),
    pt2("Apple", 7.5, 7), pt2("Apple", 8.5, 6.5), pt2("Apple", 6, 6), pt2("Apple", 9, 5.5),
    pt2("Apple", 5.5, 6.5), pt2("Apple", 7, 8),
    pt2("Lemon", 2, 4), pt2("Lemon", 3, 5), pt2("Lemon", 1.5, 3.5), pt2("Lemon", 2.5, 4.5),
    pt2("Lemon", 3.5, 5.5), pt2("Lemon", 2, 5), pt2("Lemon", 1, 4), pt2("Lemon", 4, 4.5),
    pt2("Lemon", 4.5, 6), pt2("Lemon", 3, 3.5),
  ],
};

function pxy(label: string, x: number, y: number): DataPoint {
  return { label, features: { x, y } };
}

/** Two clean clusters a single straight line can separate — for the neuron. */
const BLOBS: Dataset = {
  id: "blobs",
  name: "Two groups",
  featureNames: ["x", "y"],
  classes: ["Group A", "Group B"],
  summary: "20 dots · 2 groups a straight line can separate",
  points: [
    pxy("Group A", 1, 2), pxy("Group A", 2, 1), pxy("Group A", 2, 3), pxy("Group A", 3, 2), pxy("Group A", 1, 4),
    pxy("Group A", 3, 1), pxy("Group A", 2, 2), pxy("Group A", 4, 2), pxy("Group A", 1, 1), pxy("Group A", 3, 3),
    pxy("Group B", 7, 8), pxy("Group B", 8, 7), pxy("Group B", 6, 9), pxy("Group B", 9, 6), pxy("Group B", 7, 7),
    pxy("Group B", 8, 8), pxy("Group B", 6, 7), pxy("Group B", 9, 8), pxy("Group B", 7, 9), pxy("Group B", 8, 6),
  ],
};

function pc(label: string, weight: number, ears: number, tail: number): DataPoint {
  return { label, features: { weight, ears, tail } };
}

/** Pets told apart by three measurements — needs 2–3 splits to sort well (one
 * split only isolates rabbits). A little overlap (a small dog, a heavy cat, a
 * long-tailed rabbit) keeps it under 100% so deeper trees visibly overfit.
 * Built for the Decision Tree Studio (rows ordered by kind; every 3rd = test). */
const CREATURES: Dataset = {
  id: "creatures",
  name: "Pets",
  featureNames: ["weight", "ears", "tail"],
  units: { weight: "kg", ears: "cm", tail: "cm" },
  classes: ["Cat", "Dog", "Rabbit"],
  summary: "36 pets · 3 kinds · 3 measurements (weight, ears, tail)",
  points: [
    // Cats — light, medium ears, long tail
    pc("Cat", 4.0, 6, 26), pc("Cat", 4.5, 5, 28), pc("Cat", 3.8, 6, 24),
    pc("Cat", 5.0, 7, 30), pc("Cat", 4.2, 5, 25), pc("Cat", 4.8, 6, 27),
    pc("Cat", 3.5, 6, 23), pc("Cat", 6.0, 7, 29), pc("Cat", 4.4, 5, 26),
    pc("Cat", 4.6, 6, 28), pc("Cat", 4.0, 6, 24), pc("Cat", 5.5, 7, 31),
    // Dogs — heavy, long tail (a couple of small dogs overlap the cats)
    pc("Dog", 12, 8, 32), pc("Dog", 20, 6, 30), pc("Dog", 6.5, 5, 24),
    pc("Dog", 25, 9, 35), pc("Dog", 15, 7, 28), pc("Dog", 30, 8, 36),
    pc("Dog", 11, 5, 25), pc("Dog", 18, 7, 31), pc("Dog", 22, 6, 33),
    pc("Dog", 14, 8, 29), pc("Dog", 27, 9, 34), pc("Dog", 7.0, 6, 26),
    // Rabbits — tiny, long ears, stubby tail (one long-tailed rabbit overlaps)
    pc("Rabbit", 1.8, 11, 5), pc("Rabbit", 2.0, 10, 4), pc("Rabbit", 1.5, 12, 6),
    pc("Rabbit", 2.4, 9, 5), pc("Rabbit", 1.6, 11, 4), pc("Rabbit", 2.2, 13, 6),
    pc("Rabbit", 1.4, 10, 3), pc("Rabbit", 2.6, 12, 9), pc("Rabbit", 1.9, 11, 5),
    pc("Rabbit", 2.1, 9, 4), pc("Rabbit", 1.7, 12, 6), pc("Rabbit", 2.3, 10, 5),
  ],
};

export const DATASETS: Record<string, Dataset> = {
  flowers: FLOWERS,
  fruit2d: FRUIT2D,
  blobs: BLOBS,
  creatures: CREATURES,
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

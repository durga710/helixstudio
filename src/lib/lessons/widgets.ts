/**
 * Server-safe catalog of the Lab's interactive widgets — ids + descriptions.
 * The client widget registry (`src/components/lab/widgets/index.tsx`) registers
 * components for these ids; AI generation, the lesson editor's widget picker,
 * and lesson validation all reference THIS list (never client code), so an
 * authored lesson can only embed a widget that actually exists.
 *
 * Add a widget's id here when its component is registered.
 */

export interface WidgetInfo {
  id: string;
  label: string;
  /** Shown to the model so it knows when to use the widget. */
  desc: string;
}

export const WIDGET_CATALOG: WidgetInfo[] = [
  {
    id: "classifier",
    label: "Image classifier (train your own)",
    desc: "The student trains a real image classifier with webcam/upload examples, then tests it live. Use for: classification, what 'training' means, teaching a computer to recognize things.",
  },
];

export const WIDGET_IDS: string[] = WIDGET_CATALOG.map((w) => w.id);

export function isWidgetId(id: string): boolean {
  return WIDGET_IDS.includes(id);
}

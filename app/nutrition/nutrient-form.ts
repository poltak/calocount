import { parseNutrientProvenance, type NutrientProvenanceMap } from "../../domain/nutrient-provenance";
import { NUTRIENT_UPPER_LIMIT_KEYS, type NutrientKey } from "../../domain/nutrients";
import { nutrientKeys, parseNutrientValue, type NutrientValueMap } from "./nutrient-meta";

/** Read the nutrient fields of a submitted entry form. */
export function nutrientValuesFromForm(form: FormData, namePrefix = "nutrient-"): NutrientValueMap {
  const values: NutrientValueMap = {};
  for (const key of nutrientKeys) values[key] = parseNutrientValue(form.get(`${namePrefix}${key}`));
  for (const key of NUTRIENT_UPPER_LIMIT_KEYS) values[key] = parseNutrientValue(form.get(`${namePrefix}${key}`));
  return values;
}

export function nutrientProvenanceFromForm(
  form: FormData,
  namePrefix = "nutrient-origin-",
  values = nutrientValuesFromForm(form),
): NutrientProvenanceMap {
  const raw: Partial<Record<NutrientKey, unknown>> = {};
  for (const key of nutrientKeys) raw[key] = form.get(`${namePrefix}${key}`);
  return parseNutrientProvenance(raw, values);
}

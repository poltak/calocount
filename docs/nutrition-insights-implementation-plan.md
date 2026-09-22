# Nutrition insights: priorities and rough implementation plans

Date: 2026-09-21

Status: five visualization experiences and the source-specific upper-limit, provenance, and historical-edit extensions implemented in this worktree; personalized intake references and whole-day logging confirmation remain future work

The implementation adds 14/28-day shortfall, high-day, and data-coverage views; manual food-change comparisons; and nutrient-source dependence. Shortfall details show every date and its eligibility, source contributions, reference details, and owner-only inspection and editing for historical entries. Excess details show daily crossings, mean, maximum, sources, and reference scope. Food comparisons include reference-percent bars and concise generated tradeoffs; selecting a shortfall focuses the comparison. Source views show concentration, repeated use, entry details, and hypothetical removal.

A private, explicit adult 19+ setting enables comparison of recorded total vitamin B6 with the U.S. Food and Nutrition Board adult upper limit. A separate adult confirmation enables vitamin A, vitamin E, folic-acid, and supplemental-magnesium limits only when their specific form/source amounts are explicitly recorded. The excess chart and source details use those amounts, rather than total nutrient amounts. The public view receives neither private setting. Each regular nutrient value can carry an explicit manual, label, database, or AI origin; legacy values retain unknown origin. Personalized RDA/AI references and confirmation that a whole day was logged remain future data/workflow extensions. Missing fields must never be interpreted as a safe or excessive intake.

## Purpose

Help someone who logs food regularly answer:

- Which nutrients are persistently low in my recorded diet?
- Which nutrients am I repeatedly getting above a relevant limit?
- How reliable are those conclusions?
- Which familiar food changes could improve the pattern?
- Which food habits supply nutrients I would otherwise miss?

The proposed entry point is a **Nutrition attention** panel. It summarizes a few useful findings, then opens the history, reference explanation, and food sources behind each finding. Build on the existing nutrient matrix, trends, and food contributions rather than adding another collection of disconnected charts.

This is a product and engineering plan, not an assessment of the owner's diet. Any example text below is illustrative. Food logs describe estimated intake; they do not diagnose deficiency, toxicity, absorption problems, or nutrient status in the body.

## Priorities

Weights represent relative product importance, not medical severity or engineering effort.

| Rank | Feature | Weight | Relative effort | Main dependency |
| --- | --- | ---: | --- | --- |
| 1 | Persistent nutrient shortfalls | 30% | Medium | Reference metadata and coverage-aware daily statistics |
| 2 | Repeated excess and upper-limit monitoring | 25% | Medium for sodium/saturated fat; higher for vitamin limits | Correct threshold type, population, source, and nutrient form |
| 3 | Food changes that address particular gaps | 20% | Medium–large | Findings from 1–2 and comparable logged portions |
| 4 | Missing intake versus missing information | 15% | Small–medium | Existing nutrient completeness counts |
| 5 | Dependence on particular nutrient sources | 10% | Medium | Reliable food grouping and contribution totals |

Feature 4 is a prerequisite for interpreting the other features, so build it first despite its lower standalone priority.

## Shared interpretation rules

### Separate goals, reference intakes, and upper limits

The existing `minimum`/`maximum` goal direction is useful for progress displays, but insufficient for interpreting health-related excesses.

Maintain separate concepts:

- **Personal goal:** a user-selected amount. Exceeding it means exceeding that goal.
- **Recommended intake:** an RDA or AI, where applicable to the user's profile.
- **General label reference:** an FDA Daily Value, explicitly labelled when used as a fallback.
- **Reduction guideline:** a threshold used to discuss intake such as sodium or saturated fat; not a toxicity boundary.
- **Tolerable upper intake level (UL):** a nutrient-specific reference with a defined population and source/form scope.

An intake above 100% of the recommended amount does not automatically exceed a UL. An intake below a reference does not establish deficiency. An AI is not a diagnostic cutoff: being below it does not by itself establish inadequacy. No established UL does not mean unlimited intake is proven safe. See [NIH reference definitions](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx).

For the first release, keep comparisons to existing defaults or personal goals clearly labelled. Introduce personalized RDA/AI references only with the necessary profile information. Do not silently infer age, sex, pregnancy/lactation status, or a clinical diet from logs.

Record the authority, reference version, population, unit, applicable source/form, and review date for every health-related threshold. Pick a documented reference framework; do not mix authorities opportunistically. Preserve personal goals separately from these references.

### Nutrient-specific treatment

| Nutrient | Planned interpretation | Data requirement or restriction |
| --- | --- | --- |
| Fiber | Show sustained intake below the selected reference | No generic excess warning merely for exceeding the goal |
| Sodium | Show repeated intake above the selected reduction guideline | Explain this as a chronic-risk-related intake reference, not acute toxicity |
| Saturated fat | Show intake above the selected guideline | Distinguish a gram-based label reference from a percentage-of-energy guideline; calculate the latter from the same day's energy |
| B12 | Show low recorded intake where sufficiently supported | No UL-based warning just because intake exceeds the recommendation |
| B6 | Support a true upper-limit comparison after reference configuration | US and European adult ULs differ substantially; identify the chosen authority |
| Vitamin A | Total RAE can support intake-reference comparisons | Upper-limit checks require the preformed vitamin A amount; total RAE cannot substitute for it |
| Magnesium | Total intake can support intake-reference comparisons | The US UL concerns supplements/medications, not naturally occurring food magnesium |
| Folate | Total DFE can support intake-reference comparisons | Do not compare total DFE directly with a folic-acid UL; source, form, and units matter |
| Vitamin E | Show intake-reference comparisons | Upper-limit interpretation needs the applicable supplemental form/source information |
| Total sugars | Describe amounts and any explicitly labelled personal goal | Do not treat this as added sugars or apply an added-sugar limit to it |
| Other tracked vitamins/minerals | Add individually after reviewing reference applicability | Do not generate all ULs mechanically from existing goal values |

Sources for these distinctions are linked at the end. Recheck the selected references when implementing; this document deliberately does not provide a universal threshold table.

### Preserve uncertainty and calendar meaning

- `null` means unknown; explicit `0` is a known zero.
- `NutrientAggregate.complete` means all logged items have that nutrient, not that the person logged everything they ate.
- An entry with meal status `complete` is not confirmation that the day's diet is fully recorded.
- A day with no logs is unobserved, not a zero-intake day. Explicit fasting, if supported later, needs its own status.
- Exclude the current day from persistent-pattern summaries. A separate current-day excess observation can still appear if the recorded sum already crosses a threshold.
- Use the established owner logical-date/timezone rules. Public calculations use the public UTC date boundary. Display the range and timezone context.
- Coverage counts describe missing fields, not accuracy. Do not turn an AI confidence field or item coverage percentage into a probability that an intake conclusion is correct.
- Do not scale partial nutrient totals upward by dividing by item coverage. Missing items have unequal nutrient contributions.
- Label averages with their denominator. A mean over 12 eligible days must say so, rather than appearing to cover all 28 days.
- Keep historical comparisons explicit: initially, label them as comparisons against the currently selected reference. Actual historical goal adherence requires effective-dated goal history.

## 1. Persistent nutrient shortfalls

### Experience

Show a ranked list of horizontal bars with the reference marker, recorded average, and a small trend. Offer 14- and 28-day windows. Each row opens daily values, recording coverage, and contributing foods.

Example: “Calcium: recorded intake below your selected reference in each of the last three weeks. Based on 23 days with all logged calcium values present.”

Use restrained labels such as **Below reference**, **Near reference**, or **Insufficient information**. Avoid “You are deficient,” an overall health grade, or a percentage representing health risk.

### Rough implementation

1. Add pure calculations over date-keyed nutrient aggregates and reference metadata.
2. For each nutrient, derive logged days, fully populated nutrient days, partial days, daily reference ratios, the eligible-day mean, and weekly means.
3. Start with a conservative eligibility rule: only past logged days with all that nutrient's item values present enter the shortfall mean. Show partial days separately. This limits missing-field bias but cannot establish complete dietary logging.
4. Tentative product defaults: require at least 10 eligible days in a 14-day window or 20 in a 28-day window; flag a persistent pattern only when at least two separately eligible weekly means are below the reference. A tentative eligible week requires five days. These are tunable UI rules, not validated medical cutoffs.
5. Rank qualifying rows by the number of eligible weeks below reference, then proportional shortfall, then coverage. Expose the underlying facts; do not present the ordering as medical urgency. Add a display tolerance if rounding causes unstable labels.
6. Render the top three findings with an “All nutrients” expansion. Group unsupported findings into the information-coverage view.

Include excluded dates in the detail view so a selected subset cannot masquerade as a complete dietary assessment. Show “below the AI reference” without claiming inadequate intake when the reference is an AI.

### Acceptance examples

- A low known subtotal with missing nutrient values does not become a strong shortfall finding.
- An explicit zero remains in an otherwise eligible day's mean.
- One unusual day does not create a persistent finding.
- Changing the time window recalculates both the mean and its eligible-day count.
- A disabled or missing reference produces descriptive amounts, not a fabricated target.

## 2. Repeated excess and upper-limit monitoring

### Experience

Show daily dots against the relevant threshold, with a mean, observed crossing count, maximum recorded value, and food-source breakdown. Where a nutrient has both an intake recommendation and a usable UL, show two separately labelled markers.

Example: “Recorded sodium exceeded the selected guideline on 8 of 24 logged days; 4 other days have incomplete sodium data.”

Keep individual high days visible even if the period average is below the threshold. Do not imply that low days cancel high days or that crossing a UL proves toxicity.

### Rough implementation

1. Ship sodium and saturated-fat guideline comparisons first, clearly distinguishing personal goals from published references.
2. Evaluate each day's known sum against the applicable threshold. Classify each date as observed above, fully populated at/below, indeterminate due to missing data, or unlogged.
3. A partial known sum already above the threshold can support “recorded amount already above”; missing nonnegative amounts cannot reverse that arithmetic. Incorrect estimates can, so preserve an edit path.
4. Count observed crossings without treating indeterminate dates as compliant. A provisional “repeated” badge can mean at least two observed crossings in the chosen window; show the exact dates and amounts instead of inferring a risk probability.
5. Add vitamin/mineral UL checks one nutrient at a time. If required source, form, or population information is absent, return an unsupported state with an explanation.
6. Connect each crossing to its food entries. Recompute after corrections and deletions.

### Acceptance examples

- B12 at several times the intake reference does not trigger a fabricated UL warning.
- Magnesium naturally occurring in food is not counted against a supplements-only UL.
- A vitamin A total without form information cannot produce a preformed-vitamin-A UL finding.
- An incomplete sodium sum already above the guideline remains an observed crossing.
- A personal maximum is never described as an official toxicity threshold.

## 3. Food changes that address particular gaps

### Experience

From a nutrient finding, open a **Compare a food change** panel. Select an addition or substitution from previously logged foods/entries, adjust a portion multiplier, and inspect before/after bars for the nutrients that need attention. Also show calories, sodium, and saturated fat where known.

The comparison should explain the tradeoff, for example: “This hypothetical substitution increases recorded calcium and fiber while also increasing saturated fat.” Generate the statement from the calculated values; do not assume every candidate is an improvement.

### Rough implementation

1. Begin with explicit logged entries as candidates. Preserve their names, portions, dates, and nutrient completeness; a logged entry may contain several foods rather than a standard meal.
2. Allow addition or replacement of a selected entry, with a simple multiplier such as 0.5×, 1×, or 1.5× the logged portion. Do not infer grams from an ambiguous “serving.”
3. Compute a nutrient delta vector and render absolute amounts plus reference percentages. For replacements, require known values on both sides to report a known delta for that nutrient.
4. Keep unknown projected values visibly unknown. Do not fill them with zero or allow a low recorded subtotal to win a candidate ranking automatically.
5. Start with manual comparison. Later, rank candidates by how many supported shortfalls they reduce, capping benefit once a reference is reached and showing excess-related tradeoffs separately. Any combined score is a product heuristic, not a health score.
6. Keep scenarios ephemeral. Persisting a plan or logging a meal should be an explicit, separate action.

For a weekly scenario, ask how often the substitution would occur. Do not imply a one-time meal fixes a persistent monthly pattern.

### Acceptance examples

- Missing calcium in a proposed replacement does not display as “0 mg calcium.”
- Portion scaling changes calories and every known nutrient consistently.
- A scenario does not mutate meals, targets, or saved daily totals.
- Cancelling the comparison restores the original displayed totals.

## 4. Missing intake versus missing information

### Experience

Every nutrient insight carries a coverage label, with an expandable view of missing entries. A dedicated summary lists nutrients that cannot yet be interpreted and the foods whose missing values contribute to that limitation.

Separate three concepts in the interface:

1. Did the day contain logs, and is it still in progress?
2. Are nutrient amounts present for the logged items?
3. What is known about the source of those amounts?

### Rough implementation

1. Reuse `knownItemCount`, `totalItemCount`, and `complete` to calculate item coverage and fully populated day counts per nutrient.
2. Link a missing nutrient to its original entry/item for inspection and editing. Existing aggregate totals suffice for the summary; item history is needed for drill-down.
3. Use neutral styling for unknown values and a visible partial-data treatment. Include text so color is not the only cue.
4. Reuse provenance only where it is explicitly reliable. Distinguish label/database/manual/AI estimates later through an explicit value-origin model; do not infer verification from a populated field or generic ingestion source.
5. Consider an optional “day fully logged” confirmation later. Keep it separate from nutrient completeness, and never retroactively mark old days confirmed.

Item coverage is a count of present fields, not the fraction of nutrient intake captured. A missing condiment and a missing main course are not equivalent nutritionally.

### Acceptance examples

- A day with no entries reads “No records,” not “All nutrients low.”
- All nutrient fields populated does not generate “Verified accurate.”
- Unknown days do not appear as zero-height intake bars.
- Correcting a missing value updates coverage and all dependent findings.

## 5. Dependence on particular nutrient sources

### Experience

For a chosen nutrient, show a stacked contribution bar by food across the selected weeks, with a small table of source amounts and shares. Selecting a source reveals its entries. A temporary “Exclude this source” control shows the arithmetic effect on recorded intake.

Example: “One recurring food provides 62% of your recorded calcium in this period.” This describes concentration; it does not mean that relying on a food is unhealthy.

### Rough implementation

1. Aggregate nutrient contributions from item history, preserving unknown values and unmatched names.
2. Begin with conservative exact-name grouping plus normalization of whitespace/case. Label the result as recorded entries and allow aliases/grouping later. Avoid automatically merging materially different preparations or formulations.
3. Show the largest sources plus an explicit “Other recorded sources” remainder. The segments must reconcile to the same known total used as the denominator.
4. Calculate concentration as largest-source or top-three-source share of the known amount. Suppress percentages when the known total is zero or absent.
5. For removal scenarios, subtract only recorded contributions and keep the same eligible dates. Removing a source must not silently change the denominator or imply what would replace it.
6. Surface useful information such as a source contributing to several persistent shortfalls, without turning food diversity into an unsupported medical score.

### Acceptance examples

- Top sources plus “Other” sum to the displayed known total.
- Partial intake is labelled as a share of recorded known amounts, not all actual intake.
- A zero total never generates `NaN`, infinity, or a misleading 100% source.
- A hypothetical exclusion does not delete records.

## Rough technical structure

The following are integration starting points from this checkout, not a review of the existing features:

| Existing area | Intended reuse |
| --- | --- |
| `domain/nutrients.ts` | Nutrient keys, units, nullable values, aggregation contracts |
| `domain/nutrient-goals.ts` | Existing default/custom/disabled goals; keep medical reference metadata separate |
| `app/nutrition/nutrient-meta.ts` | Formatting, labels, and existing coverage presentation |
| `app/insights/types.ts` | Daily aggregates and item-level insight history |
| `app/insights/insight-data.ts` | Reconciliation of history with live edits/deletions |
| `db/repository.ts` | Timezone-aware summary/history queries |
| `app/dashboard-api.ts` | Parsing and validating any contract extensions |
| `app/api/_lib/public-summary-projection.ts` | Explicit public projection of permitted derived data |
| `app/page.tsx` | Mount the attention panel and connect selected dates/entries |

Important: `NUTRIENT_META.maximum` is an input-validation bound, **not a dietary upper limit**. Never reuse it for excess findings.

Suggested new modules:

- `domain/nutrient-references.ts`: versioned reference definitions, applicability, and unit/source/form requirements.
- `app/insights/nutrition-attention-calculations.ts`: eligibility, window statistics, finding generation, and transparent ordering.
- `app/insights/nutrition-attention.tsx`: compact summary and nutrient detail view.
- `app/insights/nutrient-coverage.tsx`: reusable coverage summary and missing-entry drill-down.
- Separate food-scenario and source-dependence calculation/component modules when those phases begin.

Return structured findings with nutrient key, finding kind, reference ID/value/type, date range, known/eligible/partial/unlogged day counts, statistics, explanation reason codes, and source entry identifiers. Render user-facing text from these facts. A deterministic calculation layer is sufficient for the first release; free-form AI interpretation is unnecessary.

The current insight history supports 30 prior days plus the current day. That supports a 28-day view and two adjacent 14-day comparisons. Comparing two full 28-day periods, or showing 90 days, requires coordinated query, payload, parser-range, and UI changes. Never calculate a long-range food-source breakdown from a shorter recent-meal subset.

No new nutrient storage columns are required for the initial coverage/shortfall/sodium/saturated-fat work. Reliable source/form-specific upper-limit checks may require nullable structured fields for supplement/food origin, vitamin form, and value provenance, plus optional profile/reference settings. Add only fields needed by an implemented rule and preserve unknown values on existing records.

Use owner-scoped queries and existing public allowlists. Public views may show calculations derived from permitted public inputs; do not expose private profile, supplement, confidence, or provenance information merely because an owner-side feature now uses it. If a public reference cannot be explained without private context, use the clearly labelled public reference or omit that personalized interpretation.

## Build sequence

1. **Foundation:** reference metadata, pure coverage/window calculations, unit handling, and shared explanatory states. Document tentative eligibility rules in one place.
2. **First useful release:** one Nutrition attention panel with shortfall findings, sodium/saturated-fat guideline crossings, coverage, and daily/source drill-down. Use 14/28-day ranges.
3. **Broader excess interpretation:** add selected vitamin/mineral ULs after confirming authority, profile, nutrient form, and source applicability. Unsupported cases remain descriptive.
4. **Actionable comparisons:** add manual familiar-food scenarios, then optional candidate ordering once unknown-data behavior is sound.
5. **Habit context:** add source dependence and hypothetical source removal. Extend history only when the supported view needs it.

## Validation when implementing

Use focused calculation and contract tests plus a few browser flows:

- Null versus zero; partial versus fully populated; current versus past dates; no logs; insufficient eligible history.
- Unit conversions and form-specific references, including total vitamin A versus preformed A and total folate DFE versus folic acid.
- Personal goals versus RDA/AI/DV/guideline/UL labels; disabled targets; unsupported population/reference combinations.
- Partial known excess, average below a limit despite high individual days, and no false B12 upper-limit warning.
- Exact range boundaries, timezone changes, and histories shorter than the requested window.
- Meal edit/delete/copy updates without stale derived findings or duplicate entries.
- Food-scenario arithmetic, source totals, missing comparison values, and no unintended persistence.
- Public projection exclusions and owner isolation if API contracts change.
- Mobile layout, keyboard-accessible detail controls, readable units, text equivalents for charts, and labels that work without color.

For implementation changes, use the repository's typecheck/lint/test/browser commands as appropriate. This roadmap itself is documentation only.

## Open decisions before the relevant phase

- Which reference authority should be the default, and what optional profile information should personalize it?
- Are existing FDA Daily Values retained as a clearly labelled fallback for users without a profile? Recommended for the first release.
- Should users confirm a day's food logging is complete? Useful later; do not block descriptive MVP insights on it.
- Which nutrient sources/forms are worth adding to storage first? Choose based on the first UL rules being shipped.
- Should repeated-food grouping be manual aliases, a food catalogue, or confirmed suggestions? Begin conservatively.
- Which personalized findings should be available publicly? Preserve existing disclosure boundaries until explicitly designed.

## Reference sources

These sources informed the interpretation rules during planning. Recheck numeric thresholds and population applicability before shipping or changing a rule.

- [NIH: nutrient recommendations, RDA, AI, UL, and Daily Values](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx).
- [NIH: vitamin B12](https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/) — no established UL.
- [NIH: vitamin B6](https://ods.od.nih.gov/factsheets/VitaminB6-HealthProfessional/) — excess-related neuropathy and differing reference authorities.
- [NIH: vitamin A](https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/) — preformed vitamin A versus carotenoids.
- [NIH: magnesium](https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/) — supplemental/medicinal versus naturally occurring food intake.
- [NIH: folate](https://ods.od.nih.gov/factsheets/Folate-HealthProfessional/) — folate forms, DFE, and upper-limit scope.
- [NIH: supplement FAQ](https://ods.od.nih.gov/HealthInformation/ODS_Frequently_Asked_Questions/) — overview of source/form-specific upper limits, including vitamin E.
- [FDA: understanding the Nutrition Facts label](https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label) — label references and nutrients to emphasize or limit.
- [FDA: added sugars](https://www.fda.gov/food/nutrition-facts-label/added-sugars-nutrition-facts-label) — distinction from total sugars.
- [National Academies: sodium and chronic disease risk reduction](https://www.nationalacademies.org/read/25353/chapter/15).

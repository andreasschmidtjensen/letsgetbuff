# body-metrics Specification

## Purpose
TBD - created by archiving change fitness-progress-tracker. Update Purpose after archive.
## Requirements
### Requirement: Daily body metrics log
The system SHALL let the user log bodyweight (kg), sleep (hours), and protein (grams) per date, supporting the plan's recovery and testosterone levers.

#### Scenario: Log a metric
- **WHEN** the user enters bodyweight, sleep, or protein for a date and saves
- **THEN** the system stores the value against that date

#### Scenario: Partial entry
- **WHEN** the user enters only one of the three metrics for a date
- **THEN** the system saves that metric without requiring the others

#### Scenario: Edit an existing entry
- **WHEN** the user changes a metric value for a date that already has data
- **THEN** the system overwrites the prior value for that date and metric

### Requirement: Metric history view
The system SHALL display each metric's history over time so the user can see trends.

#### Scenario: View trend
- **WHEN** the user opens the body metrics view
- **THEN** the system shows logged values over time for bodyweight, sleep, and protein

### Requirement: Protein target reference
The system SHALL show the plan's protein target of ~130-150 g/day (~1.5 g/kg bodyweight) alongside the protein log.

#### Scenario: Show protein target
- **WHEN** the user views the protein metric
- **THEN** the system displays the 130-150 g/day target as reference


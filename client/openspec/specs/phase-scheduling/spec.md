# phase-scheduling Specification

## Purpose
TBD - created by archiving change fitness-progress-tracker. Update Purpose after archive.
## Requirements
### Requirement: Program week from completed training weeks
The system SHALL track a program week number that advances based on weeks the user actually trained, not the calendar. Each calendar week counts toward the program week only if it was not marked skipped.

#### Scenario: Trained week advances
- **WHEN** a calendar week contains at least one completed activity and is not marked skipped
- **THEN** that week counts toward the program week number

#### Scenario: Skipped week does not advance
- **WHEN** the user marks a calendar week "I didn't train this week"
- **THEN** that week does not count toward the program week and the phase schedule stays aligned with prior training

#### Scenario: Set start date
- **WHEN** the user sets or changes the plan start date
- **THEN** the system recomputes the program week from the start date forward, excluding skipped weeks

#### Scenario: Backdated start date
- **WHEN** the user sets a start date earlier than today (e.g. this past Tuesday)
- **THEN** the system computes the program week as the count of elapsed non-skipped ISO weeks since that date, so a start in the current week yields program week 1 and the current week's schedule

### Requirement: Phase derivation
The system SHALL derive the current phase from the program week: Phase 1 Foundation (weeks 1-4), Phase 2 Build (weeks 5-16), Phase 3 Consolidate (weeks 17-26).

#### Scenario: Phase 1
- **WHEN** the program week is between 1 and 4
- **THEN** the system reports Phase 1 - Foundation

#### Scenario: Phase 2
- **WHEN** the program week is between 5 and 16
- **THEN** the system reports Phase 2 - Build

#### Scenario: Phase 3
- **WHEN** the program week is between 17 and 26
- **THEN** the system reports Phase 3 - Consolidate

### Requirement: Weekly schedule and today's activity
The system SHALL show the correct weekly schedule (which days are Gym A, Gym B, Bike/Run, or Rest) for the current program week and highlight today's prescribed activity.

#### Scenario: Phase 1 schedule
- **WHEN** the program week is in Phase 1
- **THEN** the system shows Tuesday as Gym A and Saturday as Gym B, all other days Rest

#### Scenario: Phase 2 weeks 5-8 schedule
- **WHEN** the program week is between 5 and 8
- **THEN** the system shows Tue Gym A, Sat Gym B, Wed and Fri Bike/Run, other days Rest

#### Scenario: Saturday ride replaces Gym B from week 13
- **WHEN** the program week is 13 or later
- **THEN** the system shows Saturday as a two-way Bike ride instead of Gym B

#### Scenario: Today highlighted
- **WHEN** the user opens the app on a given weekday
- **THEN** the system highlights that day's prescribed activity and offers the matching action (log gym session or mark non-gym day done)

### Requirement: Skip-week control
The system SHALL provide a control to mark the current or a past calendar week as "I didn't train this week" and to undo that mark.

#### Scenario: Mark current week skipped
- **WHEN** the user marks the current week skipped
- **THEN** the system records the skip and the program week does not advance for that week

#### Scenario: Undo a skip
- **WHEN** the user undoes a skip on a week
- **THEN** the system removes the skip and the week counts toward the program week again


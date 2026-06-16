# workout-catalog Specification

## Purpose
TBD - created by archiving change fitness-progress-tracker. Update Purpose after archive.
## Requirements
### Requirement: Workout and exercise catalog
The system SHALL provide a built-in catalog of the plan's two workouts and their exercises, with each exercise's set/rep target, ordered alternatives, coaching notes, and warmup.

#### Scenario: Workout A contents
- **WHEN** the user views Workout A (Push & Hinge)
- **THEN** the system shows a 10-minute elliptical warmup and the exercises Dumbbell Lunge (3x10/leg), Dumbbell Bench Press (3x10), Romanian Deadlift (3x10), Seated Shoulder Press (3x10), and Plank (3x30 sec) in that order

#### Scenario: Workout B contents
- **WHEN** the user views Workout B (Pull & Quad)
- **THEN** the system shows a 10-minute rowing warmup and the exercises Leg Press (3x10), Back Extension Machine (3x12), Lat Pulldown (3x10), Dumbbell Curl (2x12), Tricep Pushdown (2x12), and Bird Dog (3x8/side) in that order

#### Scenario: Exercise detail
- **WHEN** the user opens any exercise
- **THEN** the system shows its set/rep target, listed alternatives, and coaching notes from the plan

### Requirement: Video tutorial links
The system SHALL associate each exercise with a video tutorial link that opens in a new tab.

#### Scenario: Open tutorial
- **WHEN** the user activates the video link on an exercise
- **THEN** the system opens that exercise's tutorial URL in a new browser tab without losing app state

### Requirement: Phase 2 exercise addition
The system SHALL include the Face Pull (cable, 3x15) exercise in Workout B only when the current program week is 9 or later.

#### Scenario: Face Pull hidden before week 9
- **WHEN** the current program week is 8 or earlier and the user views Workout B
- **THEN** Face Pull is not listed

#### Scenario: Face Pull shown from week 9
- **WHEN** the current program week is 9 or later and the user views Workout B
- **THEN** Face Pull (3x15) is listed with its alternatives and notes


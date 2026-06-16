## ADDED Requirements

### Requirement: Phase-based rep progression
The system SHALL determine each exercise's set/rep target from the current program phase, following the v2-2 rep progression. Main compound lifts SHALL shift toward lower reps as phases advance, while accessories SHALL mostly hold their starting range. The target depends only on the program phase (Phase 1: weeks 1-8, Phase 2: weeks 9-16, Phase 3: weeks 17-26), not the user's logged weight.

Note: the rep-progression phase boundaries (8/16) differ from the schedule phase boundaries (4/16); rep progression uses weeks 1-8, 9-16, 17-26.

#### Scenario: Compound lift rep targets by phase
- **WHEN** the system shows a main compound (Dumbbell Lunge, Dumbbell Bench Press, Seated Shoulder Press, Leg Press, Single-Arm Dumbbell Row, Lat Pulldown)
- **THEN** the target is 3x10 in weeks 1-8, 3x8 in weeks 9-16, and 4x6 in weeks 17-26

#### Scenario: RDL lag for back safety
- **WHEN** the system shows Romanian Deadlift
- **THEN** the target is 3x10 in weeks 1-8, 3x10 in weeks 9-16, and 3x8 in weeks 17-26

#### Scenario: Accessories hold their range
- **WHEN** the system shows Dumbbell Curl or Overhead Tricep Extension
- **THEN** the target is 2x12 in every phase

#### Scenario: Plank progression
- **WHEN** the system shows Plank
- **THEN** the target is 3x30 sec in weeks 1-8, 3x45 sec in weeks 9-16, and 3x60 sec in weeks 17-26

#### Scenario: Face Pull progression
- **WHEN** the current week is 9 or later and the system shows Face Pull
- **THEN** the target is 3x15 in weeks 9-16 and 3x12 in weeks 17-26

#### Scenario: Pallof Press holds reps, adds load late
- **WHEN** the system shows Pallof Press
- **THEN** the target is 3x10/side in every phase, with added load indicated from week 17

### Requirement: Rep-shift guidance
The system SHALL communicate that a rep-range shift is driven by form and consistent weight increase over 4-6 weeks rather than a fixed calendar date, and that dropping to a lower rep range pairs with roughly a 10% weight increase.

#### Scenario: Guidance shown at phase transition
- **WHEN** the program enters a phase whose rep range is lower than the previous phase for an exercise
- **THEN** the system surfaces guidance that the rep shift assumes solid form and 4-6 weeks of consistent progress, and suggests increasing weight by ~10% when dropping rep range

## MODIFIED Requirements

### Requirement: Next-weight suggestion
The system SHALL suggest the next working weight for each weighted exercise based on the user's most recent logged weight and the plan's progression increments per exercise type. The weight suggestion is independent of the rep-range progression: changing rep range does not by itself change the suggested weight, except for the manual ~10% bump guidance offered at a rep-range drop.

#### Scenario: Suggest increment after easy session
- **WHEN** the user marked the last set of an exercise as "felt easy" (2+ reps in reserve) in the most recent session
- **THEN** the system suggests increasing the weight by the plan increment for that exercise type (dumbbell +1-2 kg, Leg Press +5-10 kg, RDL +2.5 kg, cable +2.5-5 kg)

#### Scenario: Hold weight when not easy
- **WHEN** the most recent session was not marked "felt easy"
- **THEN** the system suggests repeating the same weight rather than increasing

#### Scenario: No history
- **WHEN** the exercise has no logged history
- **THEN** the system suggests no weight and prompts the user to start light per the plan

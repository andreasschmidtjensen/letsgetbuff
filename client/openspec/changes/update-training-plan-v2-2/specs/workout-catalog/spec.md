## MODIFIED Requirements

### Requirement: Workout and exercise catalog
The system SHALL provide a built-in catalog of the plan's two workouts and their exercises, with each exercise's starting set/rep target, ordered alternatives, coaching notes, and warmup. The displayed set/rep value is the Phase-1 starting target; the target evolves across phases per the progression-guidance rep progression.

#### Scenario: Workout A contents
- **WHEN** the user views Workout A (Push & Hinge)
- **THEN** the system shows a 10-minute elliptical warmup and the exercises Dumbbell Lunge (3x10/leg), Dumbbell Bench Press (3x10), Romanian Deadlift (3x10), Seated Shoulder Press (3x10), and Plank (3x30 sec) in that order

#### Scenario: Workout B contents
- **WHEN** the user views Workout B (Pull & Quad)
- **THEN** the system shows a 10-minute rowing warmup and the exercises Leg Press (3x10), Single-Arm Dumbbell Row (3x10/side), Lat Pulldown (3x10), Dumbbell Curl (2x12), Overhead Tricep Extension (2x12), and Pallof Press (3x10/side) in that order

#### Scenario: Leg Press alternatives and notes
- **WHEN** the user opens Leg Press
- **THEN** the alternatives include Step-up and Goblet Squat and the notes reflect "feet hip-width, don't lock knees at top, adjust foot height for comfort"

#### Scenario: Single-Arm Dumbbell Row detail
- **WHEN** the user opens Single-Arm Dumbbell Row
- **THEN** the target is 3x10/side, alternatives include Cable Row and Resistance Band Row, and notes reflect "rest hand and knee on bench, drive elbow back, don't twist torso"

#### Scenario: Overhead Tricep Extension detail
- **WHEN** the user opens Overhead Tricep Extension
- **THEN** the target is 2x12, alternatives include Tricep Pushdown and Close-grip Push-up, and notes reflect "hold one dumbbell with both hands overhead, elbows close to head"

#### Scenario: Pallof Press detail
- **WHEN** the user opens Pallof Press
- **THEN** the target is 3x10/side, alternatives include Band Pallof Press and Suitcase Carry, and notes reflect "stand sideways to cable, press out and hold briefly, anti-rotation core"

#### Scenario: Exercise detail
- **WHEN** the user opens any exercise
- **THEN** the system shows its set/rep target for the current phase, listed alternatives, and coaching notes from the plan

#### Scenario: Retired exercises not offered
- **WHEN** the user views Workout B
- **THEN** Back Extension Machine, Tricep Pushdown, and Bird Dog are not listed

#### Scenario: Historical entries for retired exercises render safely
- **WHEN** stored session history contains entries for retired exercise ids (back-extension, tricep-pushdown, bird-dog)
- **THEN** the system renders that history without error and does not prompt those exercises in new sessions

## ADDED Requirements

### Requirement: Safety cues on exercises
The system SHALL surface the plan's back and knee safety rules on the exercises they apply to.

#### Scenario: Knee cue on knee-loading exercises
- **WHEN** the user views Dumbbell Lunge, Leg Press, or other knee-loading exercises
- **THEN** the system shows the "knees track over toes, never cave inward" cue

#### Scenario: Back cue on hinge and back exercises
- **WHEN** the user views Romanian Deadlift, Back Extension, or Bird Dog
- **THEN** the system shows the relevant back-protection cue (e.g. "hinge at hips, back stays flat; reduce weight not reps if it twinges")

#### Scenario: Global key rule visible
- **WHEN** the user is in any logging view
- **THEN** the key rule "No loaded spinal flexion. Knees track over toes." is accessible

### Requirement: Milestone progress
The system SHALL track progress toward the plan's 6-month milestones using logged data where measurable.

#### Scenario: Leg Press milestone
- **WHEN** the user has logged Leg Press weights including a starting weight
- **THEN** the system shows current Leg Press weight against the ~2x-starting-weight milestone

#### Scenario: Qualitative milestones
- **WHEN** the user views milestones that are not directly measurable from logs (e.g. "bike commute feels easy")
- **THEN** the system lists them as self-assessed checkboxes the user can mark achieved

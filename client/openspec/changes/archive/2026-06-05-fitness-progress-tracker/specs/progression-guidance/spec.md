## ADDED Requirements

### Requirement: Next-weight suggestion
The system SHALL suggest the next working weight for each weighted exercise based on the user's most recent logged weight and the plan's progression increments per exercise type.

#### Scenario: Suggest increment after easy session
- **WHEN** the user marked the last set of an exercise as "felt easy" (2+ reps in reserve) in the most recent session
- **THEN** the system suggests increasing the weight by the plan increment for that exercise type (dumbbell +1-2 kg, Leg Press +5-10 kg, RDL +2.5 kg, cable +2.5-5 kg)

#### Scenario: Hold weight when not easy
- **WHEN** the most recent session was not marked "felt easy"
- **THEN** the system suggests repeating the same weight rather than increasing

#### Scenario: No history
- **WHEN** the exercise has no logged history
- **THEN** the system suggests no weight and prompts the user to start light per the plan

### Requirement: Felt-easy flag
The system SHALL let the user flag an exercise's last set as "felt easy" when logging, and use this flag to drive the next-weight suggestion.

#### Scenario: Record felt-easy
- **WHEN** the user toggles "felt easy" on an exercise during logging
- **THEN** the system stores the flag with that session's entry for that exercise

### Requirement: RDL safety bias
The system SHALL apply the most conservative increment to Romanian Deadlift and SHALL never auto-suggest a decrease; weight reductions remain a manual user choice per the plan's "reduce weight, not reps" rule.

#### Scenario: Conservative RDL step
- **WHEN** the system suggests a next weight for Romanian Deadlift after an easy session
- **THEN** the suggested increase is 2.5 kg

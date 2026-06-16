# session-logging Specification

## Purpose
TBD - created by archiving change fitness-progress-tracker. Update Purpose after archive.
## Requirements
### Requirement: Per-set logging
The system SHALL let the user record, for each set of each exercise in a session, the weight in kg, the reps completed, and an optional reps-in-reserve value.

#### Scenario: Log a set
- **WHEN** the user enters kg and reps for a set and saves
- **THEN** the system stores that set against the exercise, session date, and workout type

#### Scenario: Pre-filled set count
- **WHEN** the user opens an exercise to log
- **THEN** the system presents input rows matching the exercise's prescribed number of sets, pre-filled with the previous session's values where available

#### Scenario: Bodyweight and timed exercises
- **WHEN** the exercise is timed or bodyweight (e.g. Plank, Bird Dog, Push-ups)
- **THEN** the system allows logging reps or seconds without requiring a kg value

### Requirement: Mark a day done
The system SHALL let the user mark a training day as done with a single action, recording the date and the activity performed.

#### Scenario: Check off a gym day
- **WHEN** the user marks today's gym session done
- **THEN** the system records the completion with the session's logged sets and shows the day as done

#### Scenario: Check off a non-gym day
- **WHEN** the user marks a Bike/Run or Rest day done
- **THEN** the system records the completion for that date without requiring set logs

#### Scenario: Undo completion
- **WHEN** the user un-checks a day previously marked done
- **THEN** the system reverts the day to not-done while retaining any logged sets

### Requirement: Previous-session reference
The system SHALL display the most recent prior logged values for an exercise while the user logs the current session.

#### Scenario: Show last weights
- **WHEN** the user logs an exercise that has prior history
- **THEN** the system shows the kg and reps from the most recent previous session for that exercise

#### Scenario: No prior history
- **WHEN** the exercise has no prior logged session
- **THEN** the system indicates there is no previous data instead of showing values


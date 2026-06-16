## ADDED Requirements

### Requirement: LocalStorage persistence
The system SHALL persist all user data (sessions, set logs, completions, skipped weeks, body metrics, milestone state, settings) to browser LocalStorage and restore it on load.

#### Scenario: Persist across reloads
- **WHEN** the user logs data and reloads the page
- **THEN** the system restores all previously saved data without loss

#### Scenario: Autosave on change
- **WHEN** the user makes any change that mutates state
- **THEN** the system writes the updated state to LocalStorage without an explicit save action

#### Scenario: First run
- **WHEN** the app loads with no existing LocalStorage data
- **THEN** the system initializes empty state and prompts the user to set a plan start date

### Requirement: JSON export
The system SHALL let the user export all stored data as a single downloadable JSON file.

#### Scenario: Export data
- **WHEN** the user activates export
- **THEN** the system downloads a JSON file containing all stored data

### Requirement: JSON import
The system SHALL let the user import a previously exported JSON file, replacing current state after confirmation.

#### Scenario: Import valid file
- **WHEN** the user selects a valid exported JSON file and confirms
- **THEN** the system replaces current state with the file's contents and persists it

#### Scenario: Reject invalid file
- **WHEN** the user selects a file that is not valid app JSON
- **THEN** the system rejects the import, leaves current data unchanged, and reports the error

### Requirement: Schema versioning
The system SHALL store a schema version with the data and migrate or safely reject incompatible versions on load or import.

#### Scenario: Version present
- **WHEN** data is written to LocalStorage or exported
- **THEN** the payload includes a schema version field

#### Scenario: Incompatible version
- **WHEN** data with an unsupported schema version is loaded or imported
- **THEN** the system does not corrupt usable state and informs the user

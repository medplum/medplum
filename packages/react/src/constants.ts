export const DEFAULT_IGNORED_PROPERTIES = ['meta', 'implicitRules', 'contained', 'extension', 'modifierExtension'];

// Ignored only when they are top-level properties
// e.g. Patient.language is ignored, but Patient.communication.language is not ignored
export const DEFAULT_IGNORED_NON_NESTED_PROPERTIES = ['language', 'text'];

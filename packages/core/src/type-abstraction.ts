/**
 * Type Abstraction
 * ================
 * Type Abstraction should remove types from implementation files and move them to a separate file
 * It should first search for "interface" and "type" keywords and then check if they are used in the same file as an implementation
 * It should then check the codebase to see if the type is imported in other files
 * If it is, it should move the type to a separate file in a centralized location between the two, at the root level
 * that the most common files share
 * If it is not imported anywhere else it should move the type to a separate file in the same directory as the implementation file
 * but only if the file itself is 100 lines or more
 *
 * If a type is imported along with other things it should only move the type and leave the rest of the imports intact
 * If the type spreads across multiple lines it should move the entire type
 */

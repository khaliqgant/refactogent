// This file has intentional syntax errors for testing
function brokenFunction() {
  if (true {
    return "missing closing paren"
  }
}

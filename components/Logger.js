/**
 * Singleton Logger class for handling application-wide logging
 * Eliminates the need to pass log functions between components
 */
class LoggerClass {
  constructor() {
    this.messages = [];
    this.observers = [];
  }

  /**
   * Add a log message with automatic deduplication
   * @param {string} level - Log level: 'error', 'warning', 'critical', 'info'
   * @param {string} message - The message to log
   */
  log(level, message) {
    let hasCritical = this.messages.some(msg => msg.level === 'critical');

    // Check for duplicates using the same logic as the original code
    let index = this.messages.findIndex(msg => 
      msg.level + "-" + msg.message.toLowerCase() === 
      level + "-" + message.toLowerCase()
    );

    // Only log critical errors if there is no other critical error yet, and avoid duplicates
    if (level !== "critical" || (level === "critical" && !hasCritical && index < 0)) {
      // Only add if not a duplicate
      if (index < 0) {
        this.messages.push({ level, message });
        this.notifyObservers();
      }
    }
  }

  /**
   * Log an error message
   * @param {string} message - The error message
   */
  error(message) {
    this.log('error', message);
  }

  /**
   * Log a warning message
   * @param {string} message - The warning message
   */
  warning(message) {
    this.log('warning', message);
  }

  /**
   * Log a critical error message
   * @param {string} message - The critical error message
   */
  critical(message) {
    this.log('critical', message);
  }

  /**
   * Log an info message
   * @param {string} message - The info message
   */
  info(message) {
    this.log('info', message);
  }

  /**
   * Check if there are any errors or critical messages
   * @returns {boolean} True if there are errors
   */
  hasErrors() {
    return this.messages.some(msg => msg.level === 'error' || msg.level === 'critical');
  }

  /**
   * Get all logged messages (already deduplicated)
   * @returns {Array} Array of log messages
   */
  getMessages() {
    return [...this.messages];
  }

  /**
   * Get deduplicated messages in reverse order for UI display
   * @returns {Array} Array of deduplicated log messages in reverse order
   */
  getMessagesForDisplay() {
    // Messages are already deduplicated in log(), so just reverse them
    return [...this.messages].reverse();
  }

  /**
   * Clear all logged messages
   */
  clear() {
    this.messages = [];
    this.notifyObservers();
  }

  /**
   * Add an observer to be notified when messages change
   * @param {Function} callback - Function to call when messages change
   */
  addObserver(callback) {
    this.observers.push(callback);
  }

  /**
   * Remove an observer
   * @param {Function} callback - Function to remove from observers
   */
  removeObserver(callback) {
    this.observers = this.observers.filter(obs => obs !== callback);
  }

  /**
   * Notify all observers of message changes
   */
  notifyObservers() {
    this.observers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in logger observer:', error);
      }
    });
  }
}

// Create and export singleton instance
export const Logger = new LoggerClass();

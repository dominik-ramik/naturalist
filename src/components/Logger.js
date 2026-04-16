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
   * @param {string|null} groupTitle - Optional group key; messages sharing the same title are grouped in the UI
   * @param {string} message - The message to log
   */
  log(level, groupTitle, message) {
    const normalizedGroup = groupTitle ?? "Other";

    let hasCritical = this.messages.some(msg => msg.level === 'critical');

    // Build a deduplication key
    const dedupKey = `${level}-${normalizedGroup}-${message.toLowerCase()}`;

    let index = this.messages.findIndex(msg =>
      `${msg.level}-${msg.groupTitle}-${msg.message.toLowerCase()}` === dedupKey
    );

    // Only log critical errors if there is no other critical error yet, and avoid duplicates
    if (level !== "critical" || (level === "critical" && !hasCritical && index < 0)) {
      if (index < 0) {
        this.messages.push({ level, groupTitle: normalizedGroup, message });
        this.notifyObservers();
      }
    }
  }

  /**
   * Log an error message
   * @param {string} message - The error message
   * @param {string|null} [groupTitle] - Optional group title for UI grouping
   */
  error(message, groupTitle) {
    this.log('error', groupTitle ?? null, message);
  }

  /**
   * Log a warning message
   * @param {string} message - The warning message
   * @param {string|null} [groupTitle] - Optional group title for UI grouping
   */
  warning(message, groupTitle) {
    this.log('warning', groupTitle ?? null, message);
  }

  /**
   * Log a critical error message
   * @param {string} message - The critical error message
   * @param {string|null} [groupTitle] - Optional group title for UI grouping
   */
  critical(message, groupTitle) {
    this.log('critical', groupTitle ?? null, message);
  }

  /**
   * Log an info message
   * @param {string} message - The info message
   * @param {string|null} [groupTitle] - Optional group title for UI grouping
   */
  info(message, groupTitle) {
    this.log('info', groupTitle ?? null, message);
  }

  /**
   * Check if there are any critical messages
   * @returns {boolean} True if there are critical errors
   */
  hasCritical() {
    return this.messages.some(msg => msg.level === 'critical');
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
   * Get deduplicated messages ordered by severity for UI display.
   * Within the same severity level, insertion order is preserved.
   * @returns {Array} Array of deduplicated log messages ordered by severity
   */
  getMessagesForDisplay() {
    const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
    return [...this.messages].sort((a, b) => {
      const sa = severityOrder[a.level] ?? 4;
      const sb = severityOrder[b.level] ?? 4;
      return sa - sb;
    });
  }

  getCounts() {
    return this.messages.reduce((acc, msg) => {
      acc[msg.level] = (acc[msg.level] || 0) + 1;
      acc.total++;
      return acc;
    }, { critical: 0, error: 0, warning: 0, info: 0, total: 0 });
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
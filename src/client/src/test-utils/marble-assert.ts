import { isEqual } from 'lodash'

function deleteErrorNotificationStack(marble) {
  const {notification} = marble;
  if (notification) {
    const {kind, error} = notification;
    if (kind === 'E' && error instanceof Error) {
      notification.error = {name: error.name, message: error.message};
    }
  }
  return marble;
}

function stringify(x): string {
  return JSON.stringify(x, function (key, value) {
    if (Array.isArray(value)) {
      return '[' + value
        .map(function (i) {
          return '\n\t' + stringify(i);
        }) + '\n]';
    }
    return value;
  })
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n');
}

function observableMatcher(actual, expected) {
  if (Array.isArray(actual) && Array.isArray(expected)) {
    actual = actual.map(deleteErrorNotificationStack);
    expected = expected.map(deleteErrorNotificationStack);
    const passed = isEqual(actual, expected);
    if (passed) {
      return;
    }

    let message = '\nExpected \n';
    actual.forEach((x) => message += `\t${stringify(x)}\n`);

    message += '\t\nto deep equal \n';
    expected.forEach((x) => message += `\t${stringify(x)}\n`);

    console.log(message)
    expect(passed).toBe(true);
  } else {
    expect(actual).toEqual(expected);
  }
}

export {
  observableMatcher
}

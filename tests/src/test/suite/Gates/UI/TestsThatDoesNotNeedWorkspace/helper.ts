// import the webdriver and the high level browser wrapper
import { InputBox } from 'vscode-extension-tester';
// import * as vscode from 'vscode';

/**
 * Waits for quickpics to show and returns result
 *
 * @param input
 * @param timeout
 */
export async function waitForQuickPick(input: InputBox, timeout: number): Promise<string[] | undefined> {
  let picks = await input.getQuickPicks();
  const items: string[] = [];
  while (timeout > 0) {
    if (picks.length) {
      for (const pick of picks) {
        items.push(await pick.getLabel());
      }
      break;
    } else {
      await new Promise((f) => setTimeout(f, 1000));
      picks = await input.getQuickPicks();
    }

    timeout -= 1;
    if (timeout <= 0) {
      return undefined;
    }
  }
  return items;
}

/**
 * Returns text inside input box when it becomes not empty
 * @param input
 * @param timeout
 * @returns
 */
export async function getInputText(input: InputBox, timeout: number): Promise<string | undefined> {
  while (timeout > 0) {
    const inp = input.getText();
    if (!inp) {
      await new Promise((f) => setTimeout(f, 1000));
      timeout -= 1;
      continue;
    } else {
      return inp;
    }
  }
  return undefined;
}

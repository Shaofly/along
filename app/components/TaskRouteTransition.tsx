"use client";

import { createContext, useContext } from "react";

type TaskRouteTransition = ((href: string) => void) | null;

const TaskRouteTransitionContext =
  createContext<TaskRouteTransition>(null);

export const TaskRouteTransitionProvider =
  TaskRouteTransitionContext.Provider;

export function useTaskRouteTransition() {
  return useContext(TaskRouteTransitionContext);
}

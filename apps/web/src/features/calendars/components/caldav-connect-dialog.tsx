"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { mutationOptions } from "@next-safe-action/adapter-tanstack-query";
import { Alert, AlertDescription } from "@rallly/ui/alert";
import { Button } from "@rallly/ui/button";
import type { DialogProps } from "@rallly/ui/dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rallly/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@rallly/ui/form";
import { Input } from "@rallly/ui/input";
import { RadioCards, RadioCardsItem } from "@rallly/ui/radio-pills";
import { toast } from "@rallly/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon } from "lucide-react";
import React from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Trans, useTranslation } from "@/i18n/client";
import { connectCalDavAction } from "../actions";
import type { CalDavPresetId } from "../constants";
import { CALDAV_PRESETS } from "../constants";
import type { ConnectCalDavResult } from "../mutations";
import { connectCalDavSchema } from "../schema";

const formSchema = connectCalDavSchema.extend({
  preset: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

type Failure = Extract<ConnectCalDavResult, { ok: false }>["reason"];

function usePresetHint(preset: CalDavPresetId) {
  const { t } = useTranslation();
  switch (preset) {
    case "nextcloud":
      return t("caldavHintNextcloud", {
        defaultValue:
          "Enter the address of your Nextcloud. Create an app password under Settings → Security and use it here.",
      });
    case "icloud":
      return t("caldavHintIcloud", {
        defaultValue:
          "Use your Apple ID and an app-specific password from account.apple.com.",
      });
    case "fastmail":
      return t("caldavHintFastmail", {
        defaultValue:
          "Create an app password with calendar access in the Fastmail settings.",
      });
    case "gmx":
    case "webde":
      return t("caldavHintGmx", {
        defaultValue:
          "Use your email address and password. If you use two-factor authentication, create an app password.",
      });
    default:
      return t("caldavHintGeneric", {
        defaultValue:
          "Enter the CalDAV address of your calendar service. If it offers app passwords, use one instead of your main password.",
      });
  }
}

function useFailureMessage() {
  const { t } = useTranslation();
  return (reason: Failure) => {
    switch (reason) {
      case "unauthorized":
        return t("caldavErrorUnauthorized", {
          defaultValue: "The server did not accept the username or password.",
        });
      case "not_found":
      case "no_calendars":
        return t("caldavErrorNoCalendars", {
          defaultValue:
            "No calendars were found at this address. Check the server address.",
        });
      case "invalid_url":
        return t("caldavErrorInvalidUrl", {
          defaultValue: "Enter a valid https:// address.",
        });
      case "private_address":
        return t("caldavErrorPrivateAddress", {
          defaultValue:
            "This address points into a private network and cannot be used.",
        });
      case "network":
        return t("caldavErrorNetwork", {
          defaultValue: "The server could not be reached.",
        });
      default:
        return t("caldavErrorServer", {
          defaultValue: "The server answered with an error. Try again later.",
        });
    }
  };
}

export function CalDavConnectDialog({
  onConnected,
  defaultPreset = "nextcloud",
  ...dialogProps
}: DialogProps & {
  onConnected?: (connectionId: string) => void;
  defaultPreset?: CalDavPresetId;
}) {
  const { t } = useTranslation();
  const connect = useMutation(mutationOptions(connectCalDavAction));
  const failureMessage = useFailureMessage();
  const [failure, setFailure] = React.useState<Failure | null>(null);

  const initialPreset =
    CALDAV_PRESETS.find((preset) => preset.id === defaultPreset) ??
    CALDAV_PRESETS[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      preset: initialPreset.id,
      serverUrl: initialPreset.serverUrl,
      username: "",
      password: "",
      displayName: "",
    },
  });

  const presetId = form.watch("preset") as CalDavPresetId;
  const preset =
    CALDAV_PRESETS.find((item) => item.id === presetId) ?? initialPreset;
  const hint = usePresetHint(preset.id);

  const close = () => {
    dialogProps.onOpenChange?.(false);
    form.reset();
    setFailure(null);
  };

  return (
    <Dialog
      {...dialogProps}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey="caldavConnectTitle" defaults="Connect a calendar" />
          </DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="caldavConnectDescription"
              defaults="Works with any calendar that speaks CalDAV, such as Nextcloud, iCloud, mailbox.org or Posteo."
            />
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async ({ preset: _, ...values }) => {
              setFailure(null);
              try {
                const result = await connect.mutateAsync({
                  ...values,
                  displayName: values.displayName || preset.name || undefined,
                });
                if (result?.ok) {
                  toast.success(
                    t("calendarConnected", {
                      defaultValue: "Calendar connected",
                    }),
                  );
                  onConnected?.(result.connectionId);
                  close();
                } else if (result) {
                  setFailure(result.reason);
                }
              } catch {
                // The mutation cache toasts the error
              }
            })}
          >
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="preset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans i18nKey="caldavProvider" defaults="Service" />
                    </FormLabel>
                    <FormControl>
                      <RadioCards
                        className="flex-wrap gap-2"
                        value={field.value}
                        onValueChange={(value) => {
                          const next = CALDAV_PRESETS.find(
                            (item) => item.id === value,
                          );
                          field.onChange(value);
                          if (next) {
                            form.setValue("serverUrl", next.serverUrl);
                          }
                          setFailure(null);
                        }}
                      >
                        {CALDAV_PRESETS.map((item) => (
                          <RadioCardsItem key={item.id} value={item.id}>
                            {item.name ||
                              t("caldavOtherProvider", {
                                defaultValue: "Other",
                              })}
                          </RadioCardsItem>
                        ))}
                      </RadioCards>
                    </FormControl>
                    <FormDescription>{hint}</FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serverUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans
                        i18nKey="caldavServerUrl"
                        defaults="Server address"
                      />
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        placeholder={preset.placeholder}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans i18nKey="caldavUsername" defaults="Username" />
                      </FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans
                          i18nKey="caldavPassword"
                          defaults="Password or app password"
                        />
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          autoComplete="current-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans
                        i18nKey="caldavDisplayName"
                        defaults="Name (optional)"
                      />
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder={preset.name || undefined}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {failure ? (
                <Alert variant="error">
                  <AlertTriangleIcon />
                  <AlertDescription>{failureMessage(failure)}</AlertDescription>
                </Alert>
              ) : null}
              <p className="text-muted-foreground text-xs">
                <Trans
                  i18nKey="caldavPrivacyNote"
                  defaults="The password is stored encrypted and only used to read your calendars and write the entries for your polls."
                />
              </p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" />}>
                <Trans i18nKey="cancel" defaults="Cancel" />
              </DialogClose>
              <Button
                variant="primary"
                type="submit"
                loading={connect.isPending}
              >
                <Trans i18nKey="connectCalendar" defaults="Connect calendar" />
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

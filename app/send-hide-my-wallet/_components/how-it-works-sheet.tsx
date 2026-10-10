import { QuestionIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { howItWorks } from "../data";
import { ShieldLeftHalf } from "./icons";

export function HowItWorksSheet() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-1 rounded-sm text-black/35 outline-offset-2 outline-fuse-blue transition-opacity after:absolute after:-inset-x-2 after:-inset-y-3 focus-visible:outline-2 active:opacity-60"
        >
          How it works?
          <QuestionIcon aria-hidden weight="duotone" className="size-4" />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="overflow-y-auto px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] tracking-[-0.24px]">
          <div className="px-3">
            <span className="grid size-[54px] place-items-center rounded-full bg-fuse-blue/12 text-fuse-blue">
              <ShieldLeftHalf className="h-[26px] w-[22px]" />
            </span>
            <DrawerTitle className="mt-4 text-[20px]">Hide My Wallet</DrawerTitle>
            <DrawerDescription className="mt-1 text-black/45">
              Send without revealing the wallet your money lives in.
            </DrawerDescription>
            <ul className="mt-6 flex flex-col gap-4">
              {howItWorks.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3.5">
                  <Icon aria-hidden weight="duotone" className="mt-px size-[22px] shrink-0 text-fuse-blue" />
                  <p className="text-[15px] leading-5">
                    <span className="font-medium">{title}</span>
                    <span className="block text-pretty text-black/45">{body}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <DrawerClose asChild>
            <Button className="mt-7 w-full">Got it</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

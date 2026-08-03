'use client';

import {
  Children,
  type ChangeEvent,
  type ChangeEventHandler,
  type ComponentProps,
  type ReactNode,
  isValidElement,
} from 'react';
import { Button } from '@appica/ui-react/button';
import { Checkbox as AppicaCheckbox } from '@appica/ui-react/checkbox';
import { Dialog, DialogContent } from '@appica/ui-react/dialog';
import { Input } from '@appica/ui-react/input';
import {
  Select as AppicaSelect,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@appica/ui-react/select';
import { Textarea } from '@appica/ui-react/textarea';

type NativeChangeHandler = ChangeEventHandler<HTMLInputElement>;

function changeEvent(value: boolean): ChangeEvent<HTMLInputElement> {
  return {
    currentTarget: { checked: value },
    target: { checked: value },
  } as ChangeEvent<HTMLInputElement>;
}

/**
 * A compatibility bridge for the existing controlled checkbox fields.
 * It keeps the familiar `onChange(event)` API while rendering Appica's
 * accessible, animated checkbox primitive.
 */
function Checkbox({
  onChange,
  ...props
}: Omit<ComponentProps<typeof AppicaCheckbox>, 'onCheckedChange' | 'type'> & {
  onChange?: NativeChangeHandler;
}) {
  return (
    <AppicaCheckbox
      {...props}
      onCheckedChange={(checked) => onChange?.(changeEvent(checked === true))}
    />
  );
}

/**
 * Appica's radio primitive is intended for a RadioGroup. This bridge retains
 * native radio grouping for the compact settings selector while applying the
 * shared system token styling.
 */
function Radio(props: ComponentProps<'input'>) {
  return <input {...props} className={`system-radio ${props.className ?? ''}`} />;
}

type SelectProps = Omit<ComponentProps<'select'>, 'children' | 'onChange' | 'size'> & {
  children: ReactNode;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  placeholder?: string;
};

function collectSelectItems(children: ReactNode, items: Record<string, ReactNode> = {}) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === 'option') {
      const option = child.props as ComponentProps<'option'>;
      items[String(option.value ?? '')] = option.children;
      return;
    }

    if (child.type === 'optgroup') {
      collectSelectItems((child.props as ComponentProps<'optgroup'>).children, items);
      return;
    }

    collectSelectItems((child.props as { children?: ReactNode }).children, items);
  });

  return items;
}

function getOptionNodes(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return null;

    if (child.type === 'option') {
      const option = child.props as ComponentProps<'option'>;
      return (
        <SelectItem disabled={option.disabled} key={child.key} value={String(option.value ?? '')}>
          {option.children}
        </SelectItem>
      );
    }

    if (child.type === 'optgroup') {
      const group = child.props as ComponentProps<'optgroup'>;
      return (
        <SelectGroup key={child.key}>
          <SelectGroupLabel>{group.label}</SelectGroupLabel>
          {getOptionNodes(group.children)}
        </SelectGroup>
      );
    }

    return getOptionNodes((child.props as { children?: ReactNode }).children);
  });
}

/**
 * An Appica Select with the same controlled props as a native select. This
 * allows every existing form to gain the library's popup, keyboard support,
 * and focus treatment without rewriting its business logic.
 */
function Select({
  children,
  className,
  disabled,
  onChange,
  placeholder,
  value,
  defaultValue,
  ...props
}: SelectProps) {
  const resolvedValue = value === undefined ? undefined : String(value);
  const resolvedDefaultValue = defaultValue === undefined ? undefined : String(defaultValue);
  // Base UI only shows option labels in the trigger when `items` is provided;
  // otherwise the raw value (often an id) is displayed.
  const items = collectSelectItems(children);

  return (
    <AppicaSelect
      defaultValue={resolvedDefaultValue}
      disabled={disabled}
      items={items}
      onValueChange={(nextValue) => {
        const next = Array.isArray(nextValue) ? nextValue[0] ?? '' : nextValue ?? '';
        onChange?.(
          {
            currentTarget: { value: next },
            target: { value: next },
          } as ChangeEvent<HTMLSelectElement>,
        );
      }}
      value={resolvedValue}
    >
      <SelectTrigger
        aria-describedby={props['aria-describedby']}
        aria-invalid={props['aria-invalid']}
        className={className}
        disabled={disabled}
        aria-label={props['aria-label']}
        aria-required={props.required}
        id={props.id}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{getOptionNodes(children)}</SelectContent>
    </AppicaSelect>
  );
}

type ModalProps = Omit<ComponentProps<typeof DialogContent>, 'children' | 'className' | 'closeButton' | 'closeLabel'> & {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  onOpenChange: (open: boolean) => void;
};

/**
 * The app uses forms as dialog content, which Appica does not model as a
 * single component. This provides that missing application-level primitive
 * while retaining Appica's portal, focus management, Escape handling, and
 * backdrop behavior.
 */
function Modal({ children, className, labelledBy, onOpenChange, ...props }: ModalProps) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        {...props}
        aria-labelledby={labelledBy}
        className={className}
        closeButton
        closeLabel="Close modal"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export { Button, Checkbox, Input, Modal, Radio, Select, Textarea };

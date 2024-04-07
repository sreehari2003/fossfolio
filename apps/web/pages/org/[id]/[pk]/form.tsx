import {NextPageWithLayout} from 'next';
import {DashboardLayout} from '@app/layout';
import {Button} from '@app/components/ui/Button';
import {Input} from '@app/ui/components/input';
import {Separator} from '@app/ui/components/separator';
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from '@app/ui/components/card';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from '@app/ui/components/select';
import {Form as FormProvider, FormControl, FormField, FormItem, FormLabel, FormMessage,} from '@app/ui/components/form';
import {Checkbox} from '@app/ui/components/checkbox';
import {IFormInput, InputOption, SchemaPreview} from '@app/views/form';
import * as yup from 'yup';
import {SubmitHandler, useFieldArray, useForm} from 'react-hook-form';
import {yupResolver} from '@hookform/resolvers/yup';
import {apiHandler} from '@app/config';
import {useRouter} from 'next/router';
import {useEvent, useFormSchema} from '@app/hooks/api/Events';
import {useMutation} from '@tanstack/react-query';
import {Iform} from '@app/types';
import {toast} from 'sonner';
import {RiLoaderFill} from 'react-icons/ri';
import {IoIosAdd} from 'react-icons/io';
import {MdDeleteForever} from 'react-icons/md';
import {useToggle} from '@app/hooks';
import {useEffect, useState} from 'react';
import {Textarea} from '@app/ui/components/textarea';

const builderSchema = yup.object().shape({
    label: yup.string().required('label is required'),
    placeholder: yup.string(),
    required: yup.boolean().optional().default(false),
    type: yup.string().required('question type is required') as yup.StringSchema<IFormInput>,
    selectOptions: yup
        .array(
            yup.object({
                option: yup.string().trim().required('this is a required field'),
            }),
        )
        .when('type', {
            is: (val: IFormInput) => val === 'MultiSelect' || val === 'SingleSelect',
            then: (schema) => schema.required('this is a required field'),
            otherwise: (schema) => schema.notRequired(),
        }),
});

export type FormValidator = yup.InferType<typeof builderSchema>;

const Form: NextPageWithLayout = () => {
    const router = useRouter();
    const {data, isLoading, refetch} = useFormSchema();
    const {data: eventInfo} = useEvent('event');
    const [isFormStatusChanging, toggleFormStatus] = useToggle(false);

    const [messages, setMessages] = useState<
        Array<{
            ai: boolean;
            text: string;
        }>
    >([]);

    const [prompt, setPrompt] = useState<string>('');

    const {pk, id} = router.query;

    const form = useForm<FormValidator>({
        mode: 'onSubmit',
        resolver: yupResolver(builderSchema),
        defaultValues: {
            type: 'SingleLineText',
        },
    });

    const {fields, append, remove} = useFieldArray<FormValidator>({
        control: form.control,
        name: 'selectOptions',
    });

    const addNewField = () => {
        append({
            option: '',
        });
    };

    const [isFormLoading, setFormLoading] = useState(false);
    const [tempForm, setTempForm] = useState<Iform[]>([]);

    const generateForm = async () => {
        try {
            setFormLoading(true);
            const data = await apiHandler.post('/ai/form', {
                prompt: prompt,
                messages: messages,
            });
            setMessages([
                ...messages,
                {
                    ai: false,
                    text: prompt,
                },
                {ai: true, text: data.data?.fields},
            ]);
            setTempForm(data.data?.fields);
        } catch {
            toast.error('Error generating form');
        } finally {
            setFormLoading(false);
        }
    };

    const publishForm = async (status: boolean) => {
        try {
            toggleFormStatus.on();
            await apiHandler.post(`/events/publish/form/${pk}`, {
                organizationId: id,
                shouldFormPublish: status,
            });

            if (status) {
                toast.success('form was published successfully');
            } else {
                toast.success('form was unpublished successfully');
            }
        } catch {
            toast.error('Couldnt complete the operation');
        } finally {
            toggleFormStatus.off();
        }
    };

    const updateSchema = async (schema: Iform) => {
        try {
            const options = schema.selectOptions && schema.selectOptions.map((data) => data.option);
            const payload = {
                ...schema,
                selectOptions: options,
            }

            await apiHandler.post('/events/form', {
                organizationId: router.query?.id,
                data: payload,
                eventId: eventInfo?.data.id,
            });
        } catch {
            toast.error('Error adding new schema');
        }
    };

    const {isLoading: isSchemaUpdating, mutate} = useMutation(updateSchema, {
        onSuccess: () => {
            refetch();
            form.reset();
        },
    });

    const handleUpdates: SubmitHandler<FormValidator> = async (data) => {
        mutate(data);
    };

    const handleCancel = () => {
        form.reset();
    };

    const handleFieldDelete = (index: number) => {
        if (fields.length === 1) return;

        remove(index);
    };

    const isSingleOrMultiSelect =
        form.watch('type') === 'SingleSelect' || form.watch('type') === 'MultiSelect';

    useEffect(() => {
        if (isSingleOrMultiSelect) {
            addNewField();
        } else {
            for (let i = 0; i < fields.length; i++) {
                remove(i);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSingleOrMultiSelect]);

    const [savingAIForm, setSavingAIForm] = useState(false);
    const saveAIForm = async () => {
        try {
            setSavingAIForm(true);
            const promises = tempForm.map((schema) => {
                return updateSchema(schema);
            });
            await Promise.all(promises);
        } catch {
            toast.error('Error adding new schema');
        } finally {
            setTempForm([]);
            setSavingAIForm(false);
            await refetch();
            form.reset();
        }
    }

    return (
        <div className="pt-5 pr-3">
            {!eventInfo?.data.isFormPublished && (
                <Button
                    className="float-right"
                    onClick={() => publishForm(true)}
                    isLoading={isFormStatusChanging}
                >
                    Publish Form
                </Button>
            )}
            {eventInfo?.data.isFormPublished && (
                <Button
                    className="float-right"
                    onClick={() => publishForm(false)}
                    isLoading={isFormStatusChanging}
                >
                    Un Publish Form
                </Button>
            )}
            <div className="flex justify-center  h-screen  p-5 ">
                <div className="gap-20 flex justify-center">
                    <section>
                        <h3 className="text-3xl font-semibold mt-4">Form Builder</h3>
                        <p className="text-sm text-gray-400 mt-3">
                            Create Custom forms with various question types
                        </p>
                        <FormProvider {...form}>
                            <form className="space-y-4" onSubmit={form.handleSubmit(handleUpdates)}>
                                <Card className="mt-10">
                                    <CardHeader>
                                        <CardTitle>Create a new question</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            <FormField
                                                control={form.control}
                                                name="label"
                                                render={({field}) => (
                                                    <FormItem>
                                                        <FormLabel>Question</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="Enter your question"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage/>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        <div className="space-y-2 mt-2">
                                            <FormField
                                                control={form.control}
                                                name="placeholder"
                                                render={({field}) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Placeholder (optional)
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="Enter Placeholder"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage/>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        <div className="space-y-2 mt-2">
                                            <FormField
                                                control={form.control}
                                                name="type"
                                                render={({field}) => (
                                                    <FormItem>
                                                        <FormLabel htmlFor="type">
                                                            Question Type
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            defaultValue={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger id="type">
                                                                    <SelectValue placeholder="Select"/>
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent position="popper">
                                                                {InputOption.map((el) => (
                                                                    <SelectItem
                                                                        key={el.value as string}
                                                                        value={el.value as string}
                                                                    >
                                                                        {el.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage/>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        {isSingleOrMultiSelect && (
                                            <>
                                                {fields.map((dynamicField, index) => (
                                                    <div
                                                        className="flex items-center space-x-2 mt-3 group"
                                                        key={dynamicField.id}
                                                    >
                                                        <FormField
                                                            key={index}
                                                            control={form.control}
                                                            name={`selectOptions.${index}.option`}
                                                            render={({field}) => (
                                                                <FormItem className="flex flex-col w-full">
                                                                    <FormLabel className="flex items-center">
                                                                        Option {index + 1}
                                                                        <span
                                                                            className="ml-2 self-center hover:cursor-pointer  hidden group-hover:inline"
                                                                            onClick={() =>
                                                                                handleFieldDelete(
                                                                                    index,
                                                                                )
                                                                            }
                                                                        >
                                                                            <MdDeleteForever
                                                                                className="text-md text-red-600"/>
                                                                        </span>
                                                                    </FormLabel>
                                                                    <FormControl>
                                                                        <Input
                                                                            className="w-full"
                                                                            {...field}
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage {...field} />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                ))}
                                                <Button
                                                    className="w-full mt-4"
                                                    variant="outline"
                                                    onClick={addNewField}
                                                >
                                                    <IoIosAdd className="text-xl"/>
                                                </Button>
                                            </>
                                        )}
                                        <div className="flex items-center space-x-2 mt-3">
                                            <FormField
                                                control={form.control}
                                                name="required"
                                                render={({field}) => (
                                                    <FormItem className="flex flex-col">
                                                        <FormLabel>Required</FormLabel>
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                            />
                                                        </FormControl>
                                                        <FormMessage/>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex justify-between">
                                        <Button
                                            variant="outline"
                                            onClick={handleCancel}
                                            type="reset"
                                        >
                                            Cancel
                                        </Button>
                                        <Button type="submit" isLoading={isSchemaUpdating}>
                                            Add Question
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </form>
                        </FormProvider>
                        <h1 className="py-4 text-lg">Generate Form With AI</h1>
                        <div className="flex flex-col">
                            <Textarea
                                className="mb-1"
                                placeholder="Enter prompt"
                                onChange={(t) => {
                                    setPrompt(t.target.value);
                                }}
                            />
                            <Button isLoading={isFormLoading} onClick={generateForm}>
                                Generate
                            </Button>
                        </div>
                    </section>
                    <Separator orientation="vertical" className="min-h-screen"/>
                    <section>
                        <h3 className="text-3xl font-semibold mt-4">AI Form Preview</h3>
                        <Button disabled={!tempForm || savingAIForm} onClick={saveAIForm}>
                            Save Generated Form
                        </Button>
                        <p className="text-sm text-gray-400 mt-3">
                            This is how your form will look like
                        </p>

                        {isFormLoading && (
                            <Card className="mt-10 w-[300px] flex justify-center items-center h-[600px]">
                                <RiLoaderFill className="animate-spin h-8 w-8"/>
                            </Card>
                        )}

                        {tempForm && tempForm.length > 0 && (
                            <SchemaPreview
                                data={tempForm}
                                isPublic={false}
                                eventId={eventInfo?.data.id as string}
                            />
                        )}
                    </section>
                    <Separator orientation="vertical" className="min-h-screen"/>
                    <section>
                        <h3 className="text-3xl font-semibold mt-4">Preview</h3>
                        <p className="text-sm text-gray-400 mt-3">
                            This is how your form will look like
                        </p>

                        {isLoading && (
                            <Card className="mt-10 w-[300px] flex justify-center items-center h-[600px]">
                                <RiLoaderFill className="animate-spin h-8 w-8"/>
                            </Card>
                        )}

                        {data?.data && data.data.length > 0 && (
                            <SchemaPreview
                                data={data.data}
                                isPublic={false}
                                eventId={eventInfo?.data.id as string}
                            />
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

Form.Layout = DashboardLayout;
Form.RequireAuth = true;
export default Form;
